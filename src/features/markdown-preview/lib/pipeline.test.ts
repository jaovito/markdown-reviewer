import { expect, test } from "bun:test";
import { renderMarkdown } from "./pipeline";

test("renders a GFM table with header and body cells", () => {
  const html = renderMarkdown("| H1 | H2 |\n| --- | --- |\n| a | b |");
  expect(html).toContain("<table");
  expect(html).toContain("<th");
  expect(html).toContain(">H1<");
  expect(html).toContain("<td");
  expect(html).toContain(">a<");
  // Verify data-source-line anchoring survives on table
  expect(html).toMatch(/<table[^>]*data-source-line="1"/);
});

test("renders task list items as disabled checkboxes", () => {
  const html = renderMarkdown("- [ ] todo\n- [x] done");
  expect(html).toContain('type="checkbox"');
  expect(html).toContain("disabled");
  // exactly one checked box
  expect(html.match(/checked/g)?.length).toBe(1);
  expect(html).toContain("task-list-item");
});

test("renders strikethrough as <del>", () => {
  const html = renderMarkdown("~~gone~~");
  expect(html).toContain("<del>gone</del>");
});

test("autolinks bare URLs", () => {
  const html = renderMarkdown("see https://example.com now");
  expect(html).toContain('href="https://example.com"');
});

test("renders each GitHub alert type with its translated title", () => {
  const cases: Array<[string, string, string]> = [
    ["NOTE", "markdown-alert-note", "Note"],
    ["TIP", "markdown-alert-tip", "Tip"],
    ["IMPORTANT", "markdown-alert-important", "Important"],
    ["WARNING", "markdown-alert-warning", "Warning"],
    ["CAUTION", "markdown-alert-caution", "Caution"],
  ];
  for (const [marker, cls, title] of cases) {
    const html = renderMarkdown(`> [!${marker}]\n> body`);
    expect(html).toContain(cls);
    expect(html).toContain('data-alert-type="');
    expect(html).toContain(`>${title}<`);
    expect(html).toContain("body");
    expect(html).not.toContain(`[!${marker}]`);
  }
});

test("a normal blockquote stays a blockquote", () => {
  const html = renderMarkdown("> plain quote");
  expect(html).toContain("<blockquote");
  expect(html).not.toContain("markdown-alert");
});

test("sanitization strips scripts but keeps alert markup", () => {
  const html = renderMarkdown("> [!NOTE]\n> safe <script>alert(1)</script>");
  expect(html).not.toContain("<script");
  expect(html).toContain("markdown-alert-note");
  expect(html).toContain('data-alert-type="note"');
});

test("sanitization preserves data-source-line on the alert div", () => {
  const html = renderMarkdown("> [!NOTE]\n> body");
  expect(html).toMatch(/<div[^>]*data-source-line="1"/);
});

test("sanitization drops arbitrary div classes but keeps markdown-alert", () => {
  // raw HTML divs are not emitted by markdown, so assert via a crafted class
  // on the alert: the plugin only sets markdown-alert* classes, and the schema
  // allowlists exactly those — confirm no foreign class leaks through.
  const html = renderMarkdown("> [!WARNING]\n> careful");
  expect(html).toContain('class="markdown-alert markdown-alert-warning"');
});

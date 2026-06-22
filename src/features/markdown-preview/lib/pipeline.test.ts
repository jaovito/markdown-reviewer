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

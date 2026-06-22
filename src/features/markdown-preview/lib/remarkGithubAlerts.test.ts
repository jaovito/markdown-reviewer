import { expect, test } from "bun:test";
import rehypeStringify from "rehype-stringify";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { remarkGithubAlerts } from "./remarkGithubAlerts";

function render(md: string): string {
  return unified()
    .use(remarkParse)
    .use(remarkGithubAlerts, { label: (t) => `L:${t}` })
    .use(remarkRehype)
    .use(rehypeStringify)
    .processSync(md)
    .toString();
}

test("transforms each alert type into a titled alert div", () => {
  for (const type of ["note", "tip", "important", "warning", "caution"] as const) {
    const upper = type.toUpperCase();
    const html = render(`> [!${upper}]\n> body text`);
    expect(html).toContain(`class="markdown-alert markdown-alert-${type}"`);
    expect(html).toContain(`data-alert-type="${type}"`);
    expect(html).toContain(`class="markdown-alert-title"`);
    expect(html).toContain(`L:${type}`);
    expect(html).toContain("body text");
    // marker is stripped from the body
    expect(html).not.toContain(`[!${upper}]`);
    // it is a div, not a blockquote
    expect(html).not.toContain("<blockquote>");
  }
});

test("is case-insensitive on the marker", () => {
  const html = render("> [!note]\n> hi");
  expect(html).toContain("markdown-alert-note");
});

test("leaves a normal blockquote untouched", () => {
  const html = render("> just a quote");
  expect(html).toContain("<blockquote>");
  expect(html).not.toContain("markdown-alert");
});

test("does not match when text follows the marker on the same line", () => {
  const html = render("> [!NOTE] inline tail\n> body");
  expect(html).toContain("<blockquote>");
  expect(html).not.toContain("markdown-alert");
});

test("does not match an unknown marker", () => {
  const html = render("> [!BOGUS]\n> body");
  expect(html).toContain("<blockquote>");
  expect(html).not.toContain("markdown-alert");
});

test("renders an empty-body alert", () => {
  const html = render("> [!TIP]");
  expect(html).toContain("markdown-alert-tip");
  expect(html).toContain("L:tip");
});

test("preserves an existing data-source-line on the wrapper", () => {
  const html = unified()
    .use(remarkParse)
    // simulate remarkSourceLine having stamped the blockquote
    .use(() => (tree) => {
      // @ts-expect-error minimal mdast access for the test
      const bq = tree.children[0];
      bq.data = { hProperties: { "data-source-line": "5" } };
    })
    .use(remarkGithubAlerts, { label: (t) => t })
    .use(remarkRehype)
    .use(rehypeStringify)
    .processSync("> [!NOTE]\n> body")
    .toString();
  expect(html).toContain('data-source-line="5"');
  expect(html).toContain("markdown-alert-note");
});

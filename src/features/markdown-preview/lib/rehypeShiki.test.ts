import { expect, test } from "bun:test";
import { renderMarkdown } from "./pipeline";

test("highlights a known language into token spans", () => {
  const html = renderMarkdown("```ts\nconst a = 1;\n```");
  expect(html).toContain("shiki");
  // Dual-theme output uses CSS custom properties, not baked colors.
  expect(html).toContain("--shiki-light");
  expect(html).toContain("--shiki-dark");
  expect(html).toContain("const");
  // The three assertions above also pass for the plain-text fallback (the
  // "shiki"/--shiki-light/--shiki-dark custom properties sit on the <pre>
  // regardless, and "const" survives as unhighlighted text) — none of them
  // actually prove tokenization happened. A per-token span with its own
  // inline style only exists when a real grammar ran.
  expect(html).toMatch(/<span class="line"><span style="--shiki-light:#[0-9A-F]{6}/);
});

test("falls back to plain text for an unknown language", () => {
  const html = renderMarkdown("```klingon\nnuqneH\n```");
  expect(html).toContain("shiki");
  expect(html).toContain("nuqneH");
  // No crash, no language-klingon grammar attempt.
  expect(html).not.toContain("language-klingon");
});

test("falls back to plain text for a fence with no info string", () => {
  const html = renderMarkdown("```\njust text\n```");
  expect(html).toContain("shiki");
  expect(html).toContain("just text");
});

test("carries data-source-line onto the highlighted block", () => {
  // The diff gutter and comment anchoring read this attribute. Shiki replaces
  // the <pre> node, so losing it here silently breaks commenting on code.
  const html = renderMarkdown("intro\n\n```ts\nconst a = 1;\n```");
  expect(html).toMatch(/<pre[^>]*data-source-line="3"/);
});

test("leaves mermaid fences alone", () => {
  const html = renderMarkdown("```mermaid\ngraph TD;\n  A-->B;\n```");
  expect(html).toContain('<div class="mermaid">');
  expect(html).not.toContain("shiki");
});

test("escapes code content rather than trusting it", () => {
  const html = renderMarkdown('```ts\nconst x = "<script>alert(1)</script>";\n```');
  // Shiki escapes what it emits — the tag must survive as text, never as markup.
  expect(html).not.toMatch(/<script/i);
  expect(html).toMatch(/&(#x3C|lt);script/i);
});

test("falls back to plain text for a fence past the line-count ceiling", () => {
  // Tokenizing a known language costs real time (~0.85ms/line measured on
  // this repo's own source, see MAX_HIGHLIGHTED_LINES in rehypeShiki.ts) and
  // renderMarkdown runs synchronously inside a useMemo — an oversized fence
  // must not block the whole document open. 601 lines is one past the
  // threshold.
  const source = Array.from({ length: 601 }, () => "const a = 1;").join("\n");
  const html = renderMarkdown(`\`\`\`ts\n${source}\n\`\`\``);
  expect(html).toContain("shiki");
  expect(html).not.toContain("language-ts");
  // No per-token styled span — same shape as the "no info string" fallback,
  // not the tokenized shape asserted in the first test above.
  expect(html).not.toMatch(/<span class="line"><span style="--shiki-light:#[0-9A-F]{6}/);
});

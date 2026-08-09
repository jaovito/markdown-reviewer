import { expect, test } from "bun:test";
import { fromHtml } from "hast-util-from-html";
import { sanitize } from "hast-util-sanitize";
import { toHtml } from "hast-util-to-html";
import { MALICIOUS_CASES } from "./__fixtures__/malicious.ts";
import { renderMarkdown } from "./pipeline";
import { sanitizeSchema } from "./sanitizeSchema";

for (const c of MALICIOUS_CASES) {
  test(`sanitize neutralizes: ${c.name}`, () => {
    const html = renderMarkdown(c.markdown);
    for (const needle of c.mustNotContain) {
      expect(html).not.toContain(needle);
    }
    // Blanket assertions every case must satisfy.
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/\son\w+\s*=/i);
    expect(html).not.toMatch(/javascript:/i);
  });
}

test("the allowlist still passes the constructs Phase 5 shipped", () => {
  const html = renderMarkdown(
    ["| H |", "| --- |", "| a |", "", "- [x] done", "", "> [!NOTE]", "> body"].join("\n"),
  );
  expect(html).toContain("<table");
  expect(html).toContain('type="checkbox"');
  expect(html).toContain("markdown-alert-note");
  expect(html).toMatch(/data-source-line="1"/);
});

test("code fences keep their language-* class through the full pipeline", () => {
  // Regression guard: `code` used to inherit only `data-source-line` from
  // the generic block-tag default, silently dropping `class="language-ts"`.
  // Task 5's Shiki step runs after this sanitizer and reads the fence
  // language from this class, so losing it degrades every code block to
  // plain text.
  const html = renderMarkdown("```ts\nconst a = 1;\n```");
  expect(html).toContain('class="language-ts"');
  expect(html).toContain('data-source-line="1"');
});

test("footnote section keeps its dataFootnotes marker through the full pipeline", () => {
  // Regression guard for the schema's `section` entry: `mdast-util-to-hast`
  // sets this property as camelCase `dataFootnotes` (a JS object key), not
  // the hyphenated `data-footnotes` the schema previously listed, so it was
  // silently dropped. `hast-util-to-html` serializes it back to the correct
  // `data-footnotes` HTML attribute once the schema key matches.
  const html = renderMarkdown("text[^1]\n\n[^1]: note");
  expect(html).toContain("data-footnotes");
  expect(html).toContain("footnotes");
});

/**
 * Direct-sanitize suite: calls `sanitize()` from `hast-util-sanitize`
 * against `sanitizeSchema` on trees built by `hast-util-from-html`,
 * bypassing the Markdown layer entirely.
 *
 * `MALICIOUS_CASES` above mostly exercises `allowDangerousHtml: false`
 * dropping raw HTML before the sanitizer ever runs — real defense in depth,
 * but it means most of those cases would still pass with `rehypeSanitize`
 * removed from the pipeline outright. These cases build hast trees that
 * Markdown's own syntax can't produce (arbitrary attributes, bare ids,
 * nested elements) and sanitize them directly, so it's the allowlist itself
 * — not the Markdown parser — being put on trial.
 */
function direct(html: string): string {
  const tree = fromHtml(html, { fragment: true });
  return toHtml(sanitize(tree, sanitizeSchema));
}

test("direct sanitize: style attribute is stripped from any element", () => {
  expect(direct('<p style="position:fixed;inset:0">x</p>')).not.toContain("style=");
});

test("direct sanitize: id is dropped on non-heading elements", () => {
  // `id` is allowlisted on headings only (see sanitizeSchema.ts); everywhere
  // else it isn't an allowed attribute at all, so clobber-prefixing never
  // even gets a chance to apply — pairs with the heading case below, where
  // it does.
  expect(direct('<a id="location">x</a>')).not.toContain("id=");
});

test("direct sanitize: id on a heading is clobber-prefixed", () => {
  expect(direct('<h1 id="location">x</h1>')).toContain('id="user-content-location"');
});

test("direct sanitize: a non-checkbox input is not admitted as-is", () => {
  // `type` has no value restriction in `attributes.input`, so it survives
  // unchanged — see the `required` comment in sanitizeSchema.ts for why
  // that's fine. What actually neutralizes it is `required` forcing
  // `disabled` onto every `<input>` the schema ever sees.
  expect(direct('<input type="text">')).toContain("disabled");
});

test("direct sanitize: script nested inside svg is stripped entirely, content included", () => {
  expect(direct("<svg><script>alert(1)</script></svg>")).toBe("");
});

test("direct sanitize: an arbitrary class is dropped, the element is kept", () => {
  const html = direct('<div class="evil">x</div>');
  expect(html).toContain("<div");
  expect(html).not.toContain("evil");
});

test("direct sanitize: code keeps its language-* class", () => {
  expect(direct('<code class="language-ts">x</code>')).toContain('class="language-ts"');
});

test("direct sanitize: blockquote cite is not admitted", () => {
  // `protocols.cite` was removed as dead config — no element allowlists a
  // `cite` attribute, so it could never have fired. This proves the
  // attribute stays dropped end to end.
  expect(direct('<blockquote cite="https://evil.example">x</blockquote>')).not.toContain("cite=");
});

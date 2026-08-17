export interface MaliciousCase {
  /** Test name. */
  name: string;
  /** Markdown source fed to renderMarkdown. */
  markdown: string;
  /** Substrings that must NOT appear in the rendered HTML. */
  mustNotContain: string[];
}

/**
 * Attack vectors the sanitize allowlist must neutralize. Every case is a
 * regression guard — if one starts failing, the allowlist grew a hole.
 *
 * Note that `remarkRehype` runs with `allowDangerousHtml: false`, which drops
 * raw HTML before the sanitizer sees it. That is defense in depth, not the
 * thing under test: the link/image cases below reach the sanitizer through
 * Markdown's own syntax, so the allowlist itself is genuinely exercised.
 */
export const MALICIOUS_CASES: MaliciousCase[] = [
  {
    name: "script tag inline in a paragraph",
    markdown: "before <script>alert(1)</script> after",
    // CommonMark's *inline* HTML grammar makes `<script>` and `</script>`
    // separate html nodes with `alert(1)` as a sibling text node between
    // them. `allowDangerousHtml: false` drops the two tag nodes; the text
    // survives as ordinary inert paragraph prose. That is the correct
    // outcome — the tag is gone and nothing executes — so this case asserts
    // only the tag's removal. Note that removal here is the pipeline
    // dropping raw HTML before the sanitizer runs, same as the block-form
    // "malformed nesting" case below — neither exercises the allowlist
    // itself. Content removal *by the schema* is proven directly in
    // `sanitize.test.ts`'s direct-sanitize suite (the nested `svg`/`script`
    // case), which calls `sanitize()` on a tree the Markdown layer never
    // touches.
    mustNotContain: ["<script"],
  },
  {
    name: "img with onerror handler",
    markdown: '<img src="x" onerror="alert(1)">',
    mustNotContain: ["onerror", "alert(1)"],
  },
  {
    name: "svg with onload handler",
    markdown: '<svg onload="alert(1)"></svg>',
    mustNotContain: ["<svg", "onload"],
  },
  {
    name: "javascript: protocol in a Markdown link",
    markdown: "[click me](javascript:alert(1))",
    mustNotContain: ["javascript:"],
  },
  {
    name: "javascript: protocol obfuscated with an HTML entity",
    markdown: "[click me](java&#115;cript:alert(1))",
    mustNotContain: ["javascript:", "alert(1)"],
  },
  {
    name: "javascript: protocol with interleaved whitespace",
    // The bare (non-angle-bracket) destination form terminates at the first
    // whitespace, so an un-escaped tab here would just stop the link
    // destination early and produce no link at all — a vacuous test, since
    // "javascript:" then never even attempts to form. The angle-bracket
    // destination form tolerates the tab and actually produces an `<a>`,
    // which is what exercises `protocols.href`.
    markdown: "[click me](<java\tscript:alert(1)>)",
    mustNotContain: ["javascript:"],
  },
  {
    name: "data:text/html in a Markdown link",
    markdown: "[click me](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)",
    mustNotContain: ["data:text/html"],
  },
  {
    name: "data: URL in a Markdown image",
    markdown: "![x](data:text/html,<script>alert(1)</script>)",
    mustNotContain: ["data:text/html", "<script"],
  },
  {
    name: "iframe",
    markdown: '<iframe src="https://evil.example"></iframe>',
    mustNotContain: ["<iframe"],
  },
  {
    name: "object and embed",
    markdown: '<object data="evil.swf"></object><embed src="evil.swf">',
    mustNotContain: ["<object", "<embed"],
  },
  {
    name: "style tag",
    markdown: "<style>body{display:none}</style>",
    mustNotContain: ["<style", "display:none"],
  },
  {
    name: "form and input",
    markdown: '<form action="https://evil.example"><input name="pw"></form>',
    mustNotContain: ["<form", 'name="pw"'],
  },
  {
    name: "inline style attribute",
    markdown: '<p style="position:fixed;inset:0">hi</p>',
    mustNotContain: ["style="],
  },
  {
    name: "malformed nesting attempting parser escape",
    markdown: "<div><script >alert(1)</script ></div >",
    mustNotContain: ["<script", "alert(1)"],
  },
  {
    name: "meta refresh",
    markdown: '<meta http-equiv="refresh" content="0;url=https://evil.example">',
    mustNotContain: ["<meta", "http-equiv"],
  },
];

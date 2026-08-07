import { afterEach, beforeEach, expect, test } from "bun:test";
import { resolveAnchor } from "./selectionToAnchor";

/**
 * `resolveAnchor` bails out early when the selection's bounding rect is
 * zero-sized (`rangeRect.width === 0 && rangeRect.height === 0` — a real
 * empty-looking selection in a real browser). happy-dom has no layout
 * engine, so every `Range.getBoundingClientRect()` reports an all-zero rect
 * regardless of what's actually selected, which would make that guard fire
 * for every test here. Patched to a fixed non-zero rect for the duration of
 * each test so the geometry-independent branch logic below it — the part
 * these tests actually cover — gets exercised through the real, unmodified
 * `resolveAnchor` rather than a copy of its internals.
 */
let originalGetBoundingClientRect: typeof Range.prototype.getBoundingClientRect;
beforeEach(() => {
  originalGetBoundingClientRect = Range.prototype.getBoundingClientRect;
  Range.prototype.getBoundingClientRect = () =>
    ({ x: 0, y: 0, width: 10, height: 10, top: 0, right: 10, bottom: 10, left: 0 }) as DOMRect;
});
afterEach(() => {
  Range.prototype.getBoundingClientRect = originalGetBoundingClientRect;
});

function select(startNode: Node, startOffset: number, endNode: Node, endOffset: number): Selection {
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  const selection = window.getSelection();
  if (!selection) throw new Error("window.getSelection() returned null");
  selection.removeAllRanges();
  selection.addRange(range);
  return selection;
}

// Fence opener at line 3 (matches remarkSourceLine: the fence line itself,
// not its first content line), two content lines at 4 and 5 — the shape
// `rehypeShiki` actually produces: <span class="line"> per source line,
// carrying Shiki's per-token spans, `data-source-line` on the outer <pre>
// only (see rehypeShiki.ts's comment on why — mdast-util-to-hast puts it on
// <code>, rehypeShiki carries it onto the replacement <pre>).
const SHIKI_TWO_LINE_BLOCK = `
  <article>
    <pre data-source-line="3"><code class="shiki"><span class="line"><span>const a = 1;</span></span>
<span class="line"><span>const b = 2;</span></span></code></pre>
  </article>
`;

test("multi-line selection inside a Shiki-shaped code block resolves to codeBlock", () => {
  document.body.innerHTML = SHIKI_TWO_LINE_BLOCK;
  const article = document.querySelector("article") as HTMLElement;
  const spans = article.querySelectorAll("code span.line span");
  const firstLineText = spans[0]?.firstChild;
  const secondLineText = spans[1]?.firstChild;
  if (!firstLineText || !secondLineText) throw new Error("fixture missing expected text nodes");

  const selection = select(firstLineText, 0, secondLineText, 5);
  const result = resolveAnchor(article, selection);

  expect(result?.anchor).toEqual({ kind: "codeBlock", startLine: 4, endLine: 5, codeStartLine: 3 });
});

test("single-line selection inside a code block still resolves as codeBlock, not singleLine", () => {
  // The codeBlock branch never converts to `singleLine` the way the generic
  // block-element path does when startLine === endLine — it's a deliberate
  // asymmetry (see selectionToAnchor.ts:179-206): codeBlock anchors always
  // carry `codeStartLine` so the composer can re-derive the fence, which
  // `singleLine` has no field for.
  document.body.innerHTML = SHIKI_TWO_LINE_BLOCK;
  const article = document.querySelector("article") as HTMLElement;
  const secondLineText = article.querySelectorAll("code span.line span")[1]?.firstChild;
  if (!secondLineText) throw new Error("fixture missing expected text node");

  const selection = select(secondLineText, 0, secondLineText, 5);
  const result = resolveAnchor(article, selection);

  expect(result?.anchor).toEqual({ kind: "codeBlock", startLine: 5, endLine: 5, codeStartLine: 3 });
});

test("selection reaching the DOM's trailing newline clamps to the last content line", () => {
  // `lastContentLine` guards against the trailing newline markdown always
  // emits after a fence being counted as one line too many. This only bites
  // in the bare (non-Shiki) shape: `mdast-util-to-hast`'s code handler
  // literally appends `+ '\n'` to the <code> text it builds, but
  // `rehypeShiki.ts` strips that trailing newline before ever handing the
  // source to Shiki (`textOf(code).replace(/\n$/, "")`), so a Shiki-shaped
  // block's DOM has no trailing newline character left to overshoot on —
  // this fixture has to use the bare shape to exercise the clamp at all.
  // (Verified: this assertion fails with `endLine: 6` if the `Math.min`
  // clamps in selectionToAnchor.ts are removed.)
  document.body.innerHTML = `
    <article>
      <pre data-source-line="3"><code data-source-line="3">const a = 1;
const b = 2;
</code></pre>
    </article>
  `;
  const article = document.querySelector("article") as HTMLElement;
  const codeText = article.querySelector("code")?.firstChild;
  if (!codeText) throw new Error("fixture missing expected text node");
  const full = codeText.textContent ?? "";

  const selection = select(codeText, 0, codeText, full.length);
  const result = resolveAnchor(article, selection);

  expect(result?.anchor).toEqual({ kind: "codeBlock", startLine: 4, endLine: 5, codeStartLine: 3 });
});

test("bare (non-Shiki) pre>code shape resolves the same way as the Shiki shape", () => {
  // rehypeShiki's catch path (grammar throws, or some other unexpected
  // shape) leaves the original bare <pre><code> untouched. resolveAnchor
  // only walks Ranges and counts newlines in textContent — it has no
  // dependency on Shiki's <span class="line"> structure — so both shapes
  // must resolve identically for equivalent content.
  document.body.innerHTML = `
    <article>
      <pre data-source-line="3"><code data-source-line="3">const a = 1;
const b = 2;
const c = 3;</code></pre>
    </article>
  `;
  const article = document.querySelector("article") as HTMLElement;
  const codeText = article.querySelector("code")?.firstChild;
  if (!codeText) throw new Error("fixture missing expected text node");

  const selection = select(codeText, 0, codeText, "const a = 1;\nconst b = 2;\nconst c".length);
  const result = resolveAnchor(article, selection);

  expect(result?.anchor).toEqual({ kind: "codeBlock", startLine: 4, endLine: 6, codeStartLine: 3 });
});

test("a selection outside any <pre> never takes the codeBlock branch", () => {
  document.body.innerHTML = `
    <article>
      <p data-source-line="1">hello world</p>
    </article>
  `;
  const article = document.querySelector("article") as HTMLElement;
  const text = article.querySelector("p")?.firstChild;
  if (!text) throw new Error("fixture missing expected text node");

  const selection = select(text, 0, text, 5);
  const result = resolveAnchor(article, selection);

  expect(result?.anchor.kind).toBe("singleLine");
});

import type { CommentAnchor } from "@/shared/ipc/contract";

export type AnchorResult = { anchor: CommentAnchor; rangeRect: DOMRect } | null;

/**
 * Walks up from `node` looking for the nearest ancestor (including itself)
 * that carries a `data-source-line` attribute and lives inside `article`.
 */
function findSourceLineAncestor(article: HTMLElement, node: Node | null): HTMLElement | null {
  let current: Node | null = node;
  while (current && current !== article) {
    if (current.nodeType === Node.ELEMENT_NODE) {
      const el = current as HTMLElement;
      if (el.dataset?.sourceLine) return el;
    }
    current = current.parentNode;
  }
  return null;
}

/**
 * Walks up looking for the nearest enclosing `<pre>` element inside `article`.
 */
function findEnclosingPre(article: HTMLElement, node: Node | null): HTMLElement | null {
  let current: Node | null = node;
  while (current && current !== article) {
    if (current.nodeType === Node.ELEMENT_NODE) {
      const el = current as HTMLElement;
      if (el.tagName === "PRE") return el;
    }
    current = current.parentNode;
  }
  return null;
}

/** True when `node` (or any ancestor) is one of the comments-feature wrappers. */
function insideInjectedUi(node: Node | null): boolean {
  let current: Node | null = node;
  while (current) {
    if (current.nodeType === Node.ELEMENT_NODE) {
      const el = current as HTMLElement;
      if (el.dataset?.threadSlot || el.dataset?.threadBadge) return true;
    }
    current = current.parentNode;
  }
  return false;
}

function readSourceLine(el: HTMLElement | null): number | null {
  if (!el?.dataset.sourceLine) return null;
  const n = Number(el.dataset.sourceLine);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Returns the leaf node that visually precedes `(node, offset)` in document
 * order. Used to "step back" when a selection's end caret has spilled to the
 * start of the next block (offset 0) — visually nothing in that block is
 * selected, so we want to anchor against the previous block instead.
 */
function previousLeaf(article: HTMLElement, node: Node): Node | null {
  let current: Node | null = node;
  while (current && current !== article) {
    const prevSibling = current.previousSibling;
    if (prevSibling) {
      // Dive into the deepest last child of the previous sibling.
      let cursor: Node = prevSibling;
      while (cursor.lastChild) cursor = cursor.lastChild;
      return cursor;
    }
    current = current.parentNode;
  }
  return null;
}

interface EffectivePoint {
  container: Node;
  offset: number;
}

/**
 * If `endOffset === 0` the visible selection ends *before* `endContainer`.
 * Walk back to the previous leaf so the resolved line matches what the user
 * actually highlighted. We keep stepping back while the candidate position
 * isn't a valid one to anchor against (e.g. an empty element with no
 * children would produce an invalid `Range` offset).
 */
function effectiveEnd(article: HTMLElement, range: Range): EffectivePoint {
  let container = range.endContainer;
  let offset = range.endOffset;
  // Bound the walk so a malformed DOM can't loop forever.
  for (let safety = 0; safety < 256 && offset === 0 && container !== article; safety++) {
    const prev = previousLeaf(article, container);
    if (!prev) break;
    if (prev.nodeType === Node.TEXT_NODE) {
      const len = prev.textContent?.length ?? 0;
      if (len === 0) {
        // Empty text node — treat its start as zero-offset and keep walking.
        container = prev;
        offset = 0;
        continue;
      }
      container = prev;
      offset = len;
      break;
    }
    if (prev.nodeType === Node.ELEMENT_NODE) {
      const childCount = prev.childNodes.length;
      if (childCount === 0) {
        // Empty element — anchoring at offset 1 would be invalid; step back.
        container = prev;
        offset = 0;
        continue;
      }
      container = prev;
      offset = childCount;
      break;
    }
    // Anything else (comment node, etc.) — skip past it.
    container = prev;
    offset = 0;
  }
  return { container, offset };
}

/** Counts `\n` characters in the text from the start of `pre` up to `(container, offset)`. */
function newlinesUpTo(pre: HTMLElement, container: Node, offset: number): number {
  const measure = document.createRange();
  try {
    measure.setStart(pre, 0);
    measure.setEnd(container, offset);
  } catch {
    return 0;
  }
  const text = measure.toString();
  let count = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) count++;
  }
  return count;
}

/**
 * Maps a `window.Selection` into a `CommentAnchor` plus the bounding rect
 * of the selection (used by the floating action button).
 *
 * Returns `null` when:
 *   - the selection is empty / collapsed,
 *   - any endpoint sits outside `article`,
 *   - any endpoint has no resolvable `data-source-line` ancestor.
 */
export function resolveAnchor(article: HTMLElement, selection: Selection): AnchorResult {
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  if (range.collapsed) return null;
  if (!article.contains(range.startContainer) || !article.contains(range.endContainer)) {
    return null;
  }
  // Selections inside our own injected UI (thread cards, draft composers,
  // minimized badges) must not be treated as a markdown selection.
  if (insideInjectedUi(range.startContainer) || insideInjectedUi(range.endContainer)) {
    return null;
  }

  // Step past spillover endpoints (selection ending right at the start of the
  // next block). Without this, dragging from a paragraph down to a heading
  // collapses to "just the paragraph line".
  const end = effectiveEnd(article, range);

  const rangeRect = range.getBoundingClientRect();
  if (rangeRect.width === 0 && rangeRect.height === 0) return null;

  // Code block: every line inside a `<pre>` shares the same
  // `data-source-line` (= the fence opener). Count newlines to recover the
  // actual selected lines.
  const startPre = findEnclosingPre(article, range.startContainer);
  const endPre = findEnclosingPre(article, end.container);
  if (startPre && startPre === endPre) {
    const preLine = readSourceLine(startPre);
    if (preLine !== null) {
      const startOffset = newlinesUpTo(startPre, range.startContainer, range.startOffset);
      const endOffset = newlinesUpTo(startPre, end.container, end.offset);
      // `+ 1` because the fence opener is line `preLine`, the first content
      // line is `preLine + 1`. The newline counter returns 0 for the first
      // content line; bump everything by 1 to land on it.
      const startLine = preLine + 1 + startOffset;
      const endLine = preLine + 1 + endOffset;
      const [s, e] = startLine <= endLine ? [startLine, endLine] : [endLine, startLine];
      return {
        anchor: { kind: "codeBlock", startLine: s, endLine: e, codeStartLine: preLine },
        rangeRect,
      };
    }
  }

  const startEl = findSourceLineAncestor(article, range.startContainer);
  const endEl = findSourceLineAncestor(article, end.container);
  if (!startEl || !endEl) return null;

  const startLine = readSourceLine(startEl);
  const endLine = readSourceLine(endEl);
  if (startLine === null || endLine === null) return null;

  if (startLine === endLine) {
    return { anchor: { kind: "singleLine", line: startLine }, rangeRect };
  }

  const [s, e] = startLine <= endLine ? [startLine, endLine] : [endLine, startLine];
  return { anchor: { kind: "lineRange", startLine: s, endLine: e }, rangeRect };
}

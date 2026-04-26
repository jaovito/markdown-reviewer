/**
 * Scrolls the rendered Markdown preview to the block tagged with the given
 * source line. Returns the matched element (or null) so callers can flash a
 * highlight if they want.
 */
export function scrollToAnchorLine(line: number): HTMLElement | null {
  if (!Number.isFinite(line) || line <= 0) return null;
  const el = document.querySelector<HTMLElement>(`article [data-source-line="${line}"]`);
  if (!el) return null;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  return el;
}

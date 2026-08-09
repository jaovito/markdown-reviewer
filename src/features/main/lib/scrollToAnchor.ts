export interface ScrollToAnchorOptions {
  block?: ScrollLogicalPosition;
  flash?: boolean;
}

/**
 * Scrolls the rendered Markdown preview to the block tagged with the given
 * source line. Returns the matched element (or null) so callers can flash a
 * highlight if they want.
 */
export function scrollToAnchorLine(
  line: number,
  options?: ScrollToAnchorOptions,
): HTMLElement | null {
  if (!Number.isFinite(line) || line <= 0) return null;
  const el = document.querySelector<HTMLElement>(`article [data-source-line="${line}"]`);
  if (!el) return null;
  const block = options?.block ?? "center";
  el.scrollIntoView({ behavior: "smooth", block });
  if (options?.flash) {
    flashHeading(el);
  }
  return el;
}

/**
 * Temporarily flashes a highlight on a target element to give visual feedback
 * (e.g. when navigating from Table of Contents).
 */
export function flashHeading(el: HTMLElement): void {
  el.setAttribute("data-heading-flash", "true");
  setTimeout(() => {
    el.removeAttribute("data-heading-flash");
  }, 1300);
}

/**
 * Scrolls to a slugged heading by its fragment id. The sanitizer rewrites
 * `id` with a `user-content-` prefix to block DOM clobbering, so a link
 * written as `#setup` has to resolve against `#user-content-setup`. We try
 * the raw id first so hand-authored ids keep working.
 */
export function scrollToAnchorId(id: string): HTMLElement | null {
  if (!id) return null;
  const root = document.querySelector("article");
  if (!root) return null;
  const el =
    root.querySelector<HTMLElement>(`[id="${CSS.escape(id)}"]`) ??
    root.querySelector<HTMLElement>(`[id="${CSS.escape(`user-content-${id}`)}"]`);
  if (!el) return null;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  return el;
}

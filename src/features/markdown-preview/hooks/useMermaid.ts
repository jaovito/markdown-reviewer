import { i18next } from "@/shared/i18n";
import { type RefObject, useEffect, useState } from "react";

let mermaidIdCounter = 0;
// Unique per module load so render IDs (and their orphan-cleanup lookups)
// can't collide with leftovers from a previous Vite HMR cycle in dev.
const MERMAID_ID_SEED = Math.random().toString(36).slice(2, 8);

/** Tracks the OS color scheme so diagrams re-render when the theme flips. */
function usePrefersDark(): boolean {
  const [dark, setDark] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : false,
  );
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setDark(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return dark;
}

/** Replaces a diagram node's content with a localized error block + source. */
function renderFallback(node: HTMLElement, source: string): void {
  node.textContent = "";
  const wrap = document.createElement("div");
  wrap.className = "mermaid-error";
  const title = document.createElement("p");
  title.className = "mermaid-error-title";
  title.textContent = i18next.t("markdownPreview.mermaid.error");
  const pre = document.createElement("pre");
  const code = document.createElement("code");
  code.textContent = source; // textContent, never innerHTML — source is untrusted.
  pre.appendChild(code);
  wrap.append(title, pre);
  node.appendChild(wrap);
}

/**
 * Renders `<div class="mermaid">` blocks (emitted by `rehypeMermaid`) into SVG
 * client-side, after the Markdown HTML is mounted. Mermaid is lazy-imported so
 * it never enters the initial bundle, runs in `securityLevel: "strict"`, and
 * matches the OS light/dark theme. A diagram that fails to parse falls back to
 * a localized error block plus its source, without breaking the page. The
 * original source is cached on `data-mermaid-source` so a theme flip can
 * re-render from it (the node's content is SVG by then).
 */
export function useMermaid(
  containerRef: RefObject<HTMLElement | null>,
  html: string,
  onOpen?: (svg: string) => void,
): void {
  const dark = usePrefersDark();
  // biome-ignore lint/correctness/useExhaustiveDependencies: `html` is an intentional re-run trigger — new diagram nodes appear when the rendered HTML changes; its value isn't read in the body.
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const themeKey = dark ? "dark" : "light";
    const pending = Array.from(root.querySelectorAll<HTMLElement>("div.mermaid")).filter(
      (node) => node.dataset.mermaidTheme !== themeKey,
    );
    if (pending.length === 0) return;

    let cancelled = false;
    void (async () => {
      let render: typeof import("mermaid")["default"]["render"];
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: dark ? "dark" : "default",
          fontFamily: "inherit",
        });
        render = mermaid.render.bind(mermaid);
      } catch {
        // The library itself failed to load — keep the source visible.
        for (const node of pending) {
          if (cancelled) return;
          renderFallback(node, node.dataset.mermaidSource ?? node.textContent ?? "");
          node.dataset.mermaidTheme = themeKey;
        }
        return;
      }

      for (const node of pending) {
        if (cancelled) return;
        if (node.dataset.mermaidSource === undefined) {
          node.dataset.mermaidSource = node.textContent ?? "";
        }
        const source = node.dataset.mermaidSource ?? "";
        const id = `mermaid-${MERMAID_ID_SEED}-${themeKey}-${mermaidIdCounter++}`;
        try {
          const { svg } = await render(id, source);
          if (cancelled) return;
          node.innerHTML = svg;
          if (onOpen) {
            // Click a rendered diagram to open the zoom/pan lightbox. Use the
            // onclick property (not addEventListener) so a theme re-render
            // overwrites rather than stacks handlers.
            node.style.cursor = "zoom-in";
            node.onclick = () => onOpen(node.innerHTML);
          }
        } catch {
          if (cancelled) return;
          // On a parse error Mermaid leaves a temporary "bomb" error element
          // appended to <body>; remove it so it doesn't linger on the page.
          document.getElementById(id)?.remove();
          document.getElementById(`d${id}`)?.remove();
          renderFallback(node, source);
        }
        node.dataset.mermaidTheme = themeKey;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [containerRef, html, dark, onOpen]);
}

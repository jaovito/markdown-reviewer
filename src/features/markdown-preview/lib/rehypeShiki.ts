import type { Element, Root, RootContent } from "hast";
import { fromHtml } from "hast-util-from-html";
import type { Plugin } from "unified";
import { visit } from "unist-util-visit";
import { SUPPORTED_LANGS, THEMES, highlighter } from "./highlighter";

/** Concatenates all descendant text of a hast node. */
function textOf(node: RootContent): string {
  if (node.type === "text") return node.value;
  if (node.type === "element") return node.children.map(textOf).join("");
  return "";
}

/**
 * Resolves the fence's language, falling back to `text` when it is absent,
 * unknown, or not in the curated set. Shiki throws on an unloaded grammar, so
 * this check is what keeps an exotic fence from blanking the document.
 */
function langOf(code: Element): string {
  const className = code.properties?.className;
  const classes = Array.isArray(className) ? className.map(String) : [];
  const found = classes.find((c) => c.startsWith("language-"));
  if (!found) return "text";
  const lang = found.slice("language-".length).toLowerCase();
  return SUPPORTED_LANGS.has(lang) ? lang : "text";
}

/**
 * Above this many lines, skip grammar tokenization even for a supported
 * language and highlight as `text` instead — same `.shiki` container, no
 * per-token color. `renderMarkdown` runs synchronously inside a `useMemo` in
 * `MarkdownPreview.tsx`, so every millisecond here is a millisecond the file
 * fails to open.
 *
 * Measured against this repo's own TypeScript source (`InlineThreads.tsx`,
 * tiled to length — real, syntactically varied code, not a repeated
 * one-liner, which understates cost by ~6x in a synthetic worst case tried
 * alongside it) on the JS RegExp engine, best-of-3, warmed up:
 *   500 lines ≈ 450ms · 1000 lines ≈ 840ms · 2000 lines ≈ 1.7s
 * — a steady ~0.85ms/line. `text` stays cheap at any size (≈1-9ms even at
 * 2000-3000 lines) since it skips grammar matching entirely.
 *
 * 600 lines caps the worst case at roughly half a second — a felt but
 * bounded hitch — while leaving the highlighting on for the large majority
 * of realistic documentation code samples, which run well under that.
 */
const MAX_HIGHLIGHTED_LINES = 600;

/**
 * Highlights fenced code blocks with Shiki.
 *
 * Runs AFTER `rehype-sanitize`, deliberately. Shiki emits inline `style` on
 * nearly every span; admitting `style` into the document allowlist to
 * accommodate that would weaken the schema for every element, permanently, to
 * serve one generator. Running afterwards is safe because Shiki's input is
 * already-sanitized text and Shiki escapes what it emits — it is a generator
 * producing markup from text, never a passthrough for author HTML.
 *
 * Dual-theme output (`defaultColor: false`) emits `--shiki-light` /
 * `--shiki-dark` custom properties, so an OS theme flip is handled purely in
 * CSS with no re-render.
 */
export const rehypeShiki: Plugin<[], Root> = () => {
  return (tree) => {
    visit(tree, "element", (node, index, parent) => {
      if (!parent || index === undefined) return;
      if (node.tagName !== "pre") return;
      const code = node.children.find(
        (child): child is Element => child.type === "element" && child.tagName === "code",
      );
      if (!code) return;

      const resolvedLang = langOf(code);
      const source = textOf(code).replace(/\n$/, "");
      const lineCount = source === "" ? 0 : source.split("\n").length;
      const lang = lineCount > MAX_HIGHLIGHTED_LINES ? "text" : resolvedLang;
      let html: string;
      try {
        html = highlighter.codeToHtml(source, {
          lang,
          themes: THEMES,
          defaultColor: false,
        });
      } catch {
        // One bad fence must never blank a document — leave the original
        // <pre><code> in place and move on.
        return;
      }

      const fragment = fromHtml(html, { fragment: true });
      const replacement = fragment.children.find(
        (child): child is Element => child.type === "element" && child.tagName === "pre",
      );
      if (!replacement) return;
      // Shiki sets `tabindex="0"` on the `<pre>` itself — a deliberate a11y
      // affordance so keyboard users can focus and scroll a wide block that
      // overflows horizontally. Left as-is on purpose; don't strip it.

      // `mdast-util-to-hast`'s `code` handler applies `hProperties` (where
      // `remarkSourceLine` stamps `data-source-line`) to the inner `<code>`
      // it builds, not the `<pre>` wrapper it creates around it — the `<pre>`
      // sanitizeSchema.ts allowlists it on is defensive, never actually
      // populated pre-Shiki. So the attribute has to be read off `code` here,
      // not off `node` (the original `<pre>`). The diff gutter and comment
      // anchoring read it off the block's outermost element, so it's written
      // onto the replacement `<pre>` — Shiki replaces the node entirely, so
      // losing this carry-over breaks commenting on code blocks silently.
      const sourceLine = code.properties?.["data-source-line"];
      if (sourceLine !== undefined) {
        replacement.properties = { ...replacement.properties, "data-source-line": sourceLine };
      }

      // Shiki's own `<code>` carries no class — it styles via the `.shiki`
      // `<pre>` and per-token inline custom properties. Restore the fence's
      // `language-*` class (only when a real grammar was used, never the
      // "text" fallback) so it stays discoverable on the rendered block, the
      // same way it was before Shiki ran.
      if (lang !== "text") {
        const replacementCode = replacement.children.find(
          (child): child is Element => child.type === "element" && child.tagName === "code",
        );
        if (replacementCode) {
          replacementCode.properties = {
            ...replacementCode.properties,
            className: [`language-${lang}`],
          };
        }
      }

      parent.children[index] = replacement;
    });
  };
};

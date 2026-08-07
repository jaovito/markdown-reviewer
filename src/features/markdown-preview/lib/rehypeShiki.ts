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

      const lang = langOf(code);
      const source = textOf(code).replace(/\n$/, "");
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

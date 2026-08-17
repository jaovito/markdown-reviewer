import type { Element, Root, RootContent } from "hast";
import type { Plugin } from "unified";
import { visit } from "unist-util-visit";

/** Concatenates all descendant text of a hast node. */
function textOf(node: RootContent): string {
  if (node.type === "text") return node.value;
  if (node.type === "element") return node.children.map(textOf).join("");
  return "";
}

function hasMermaidClass(code: Element): boolean {
  const className = code.properties?.className;
  const classes = Array.isArray(className) ? className : [];
  return classes.includes("language-mermaid");
}

/**
 * Rewrites Mermaid fenced code blocks (` ```mermaid `) — which remark-rehype
 * emits as `<pre><code class="language-mermaid">…</code></pre>` — into
 * `<div class="mermaid">SOURCE</div>`. The diagram source is kept as the
 * div's text content; the client-side `useMermaid` hook renders it to SVG
 * after mount (with a localized error fallback).
 *
 * The replacement deliberately drops `data-source-line`: a rendered diagram
 * isn't line-anchorable, so the comment/diff-gutter machinery
 * (`splitCodeBlocks`, which targets `pre[data-source-line]`) must skip it.
 *
 * Runs after `remark-rehype` and before `rehype-sanitize`, so the resulting
 * `div.mermaid` is in the tree the sanitize allowlist validates.
 */
export const rehypeMermaid: Plugin<[], Root> = () => {
  return (tree) => {
    visit(tree, "element", (node, index, parent) => {
      if (!parent || index === undefined) return;
      if (node.tagName !== "pre") return;
      const code = node.children.find(
        (child): child is Element => child.type === "element" && child.tagName === "code",
      );
      if (!code || !hasMermaidClass(code)) return;

      const source = textOf(code).replace(/\n$/, "");
      const div: Element = {
        type: "element",
        tagName: "div",
        properties: { className: ["mermaid"] },
        children: [{ type: "text", value: source }],
      };
      parent.children[index] = div;
    });
  };
};

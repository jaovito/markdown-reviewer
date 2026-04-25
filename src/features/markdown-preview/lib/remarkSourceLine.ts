import type { Plugin } from "unified";
import { visit } from "unist-util-visit";

const BLOCK_TYPES = new Set([
  "paragraph",
  "heading",
  "list",
  "listItem",
  "blockquote",
  "code",
  "table",
  "tableRow",
  "tableCell",
  "thematicBreak",
]);

/**
 * Mirrors each block-level mdast node's source line into HAST as a
 * `data-source-line` attribute. The `#12` diff gutter uses this to align
 * markers next to rendered DOM nodes.
 */
export const remarkSourceLine: Plugin = () => {
  return (tree) => {
    visit(tree, (node) => {
      if (!BLOCK_TYPES.has(node.type)) return;
      const line = node.position?.start.line;
      if (typeof line !== "number") return;
      if (!node.data) node.data = {};
      const data = node.data as { hProperties?: Record<string, unknown> };
      if (!data.hProperties) data.hProperties = {};
      data.hProperties.dataSourceLine = String(line);
    });
  };
};

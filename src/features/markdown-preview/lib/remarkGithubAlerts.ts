import type { Blockquote, Paragraph, Root, Text } from "mdast";
import type { Plugin } from "unified";
import { visit } from "unist-util-visit";

export type AlertType = "note" | "tip" | "important" | "warning" | "caution";

const ALERT_TYPES = new Set<AlertType>(["note", "tip", "important", "warning", "caution"]);

/** Marker must be the only content on the first line: `[!TYPE]` then EOL/EOF. */
const MARKER = /^\[!(note|tip|important|warning|caution)\][ \t]*(\n|$)/i;

export interface RemarkGithubAlertsOptions {
  /** Resolves the visible title for a type. Defaults to capitalizing the type. */
  label?: (type: AlertType) => string;
}

interface HData {
  hName?: string;
  hProperties?: Record<string, unknown>;
}

/**
 * Turns a GitHub alert blockquote (`> [!NOTE]` …) into
 * `<div class="markdown-alert markdown-alert-note" data-alert-type="note">`
 * with a translated title paragraph. Runs AFTER remarkSourceLine so the
 * `data-source-line` already stamped on the blockquote is preserved on the
 * resulting div, keeping comment/diff anchoring intact. Non-matching
 * blockquotes are left untouched.
 */
export const remarkGithubAlerts: Plugin<[RemarkGithubAlertsOptions?], Root> = (options = {}) => {
  const label =
    options.label ?? ((type: AlertType) => type.charAt(0).toUpperCase() + type.slice(1));

  return (tree) => {
    visit(tree, "blockquote", (node: Blockquote) => {
      const firstChild = node.children[0];
      if (!firstChild || firstChild.type !== "paragraph") return;
      const firstInline = firstChild.children[0];
      if (!firstInline || firstInline.type !== "text") return;

      const match = MARKER.exec(firstInline.value);
      if (!match || !match[1]) return;
      const type = match[1].toLowerCase() as AlertType;
      if (!ALERT_TYPES.has(type)) return;

      // Strip the marker line from the body's first text node.
      firstInline.value = firstInline.value.slice(match[0].length);

      // If the marker was the entire first paragraph (e.g. `> [!TIP]` with no
      // body, or the body on a following blank-separated paragraph), that
      // paragraph is now empty — drop it so the alert has no stray empty <p>.
      if (firstInline.value === "" && firstChild.children.length === 1) {
        node.children.shift();
      }

      // Turn the blockquote into the alert wrapper, preserving prior hProperties.
      if (!node.data) node.data = {};
      const data = node.data as HData;
      const prior = data.hProperties ?? {};
      data.hName = "div";
      data.hProperties = {
        ...prior,
        className: ["markdown-alert", `markdown-alert-${type}`],
        "data-alert-type": type,
      };

      // Prepend the title paragraph.
      const title: Paragraph = {
        type: "paragraph",
        data: {
          hProperties: { className: ["markdown-alert-title"], "data-alert-type": type },
        },
        children: [{ type: "text", value: label(type) } satisfies Text],
      };
      node.children.unshift(title);
    });
  };
};

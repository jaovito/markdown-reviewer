import { i18next } from "@/shared/i18n";
import type { Schema } from "hast-util-sanitize";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { rehypeMermaid } from "./rehypeMermaid";
import { type AlertType, remarkGithubAlerts } from "./remarkGithubAlerts";
import { remarkSourceLine } from "./remarkSourceLine";

/**
 * Sanitize schema extended to allow `data-source-line` on common block
 * elements (the #12 diff gutter anchors against rendered nodes) plus the
 * alert wrapper classes/attributes emitted by `remarkGithubAlerts`, plus the
 * `mermaid` wrapper class (`rehypeMermaid`). Phase 5 keeps this allowlist
 * tight — no `svg`/`path`; alert icons are pure CSS and Mermaid SVG is
 * injected client-side (post-sanitize) by the library itself.
 */
const ANCHOR_TAGS = [
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "blockquote",
  "pre",
  "code",
  "table",
  "tr",
  "td",
  "th",
] as const;

const ALERT_CLASSNAMES = [
  "markdown-alert",
  "markdown-alert-note",
  "markdown-alert-tip",
  "markdown-alert-important",
  "markdown-alert-warning",
  "markdown-alert-caution",
] as const;

function withSourceLine(tag: string): string[] {
  return [...((defaultSchema.attributes?.[tag] as string[] | undefined) ?? []), "data-source-line"];
}

const schema: Schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    ...Object.fromEntries(ANCHOR_TAGS.map((tag) => [tag, withSourceLine(tag)])),
    div: [
      ...((defaultSchema.attributes?.div as string[] | undefined) ?? []),
      "data-source-line",
      "data-alert-type",
      ["className", ...ALERT_CLASSNAMES, "mermaid"],
    ],
    p: [...withSourceLine("p"), "data-alert-type", ["className", "markdown-alert-title"]],
  },
};

const labelForAlert = (type: AlertType): string => i18next.t(`markdownPreview.alerts.${type}`);

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkSourceLine)
  .use(remarkGithubAlerts, { label: labelForAlert })
  .use(remarkRehype, { allowDangerousHtml: false })
  .use(rehypeMermaid)
  .use(rehypeSanitize, schema)
  .use(rehypeStringify);

export function renderMarkdown(source: string): string {
  return processor.processSync(source).toString();
}

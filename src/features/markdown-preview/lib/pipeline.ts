import { i18next } from "@/shared/i18n";
import rehypeSanitize from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { rehypeMermaid } from "./rehypeMermaid";
import { type AlertType, remarkGithubAlerts } from "./remarkGithubAlerts";
import { remarkSourceLine } from "./remarkSourceLine";
import { sanitizeSchema } from "./sanitizeSchema";

const labelForAlert = (type: AlertType): string => i18next.t(`markdownPreview.alerts.${type}`);

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkSourceLine)
  .use(remarkGithubAlerts, { label: labelForAlert })
  .use(remarkRehype, { allowDangerousHtml: false })
  .use(rehypeSlug)
  .use(rehypeMermaid)
  .use(rehypeSanitize, sanitizeSchema)
  .use(rehypeStringify);

export function renderMarkdown(source: string): string {
  return processor.processSync(source).toString();
}

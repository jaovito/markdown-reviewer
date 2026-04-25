import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { remarkSourceLine } from "./remarkSourceLine";

/**
 * Sanitize schema extended to allow `data-source-line` on common block
 * elements; #12 needs that attribute to anchor the diff gutter against
 * rendered nodes. Phase 5 will revisit this allowlist for GFM/Mermaid.
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

const schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    ...Object.fromEntries(
      ANCHOR_TAGS.map((tag) => [
        tag,
        [...((defaultSchema.attributes?.[tag] as string[] | undefined) ?? []), "dataSourceLine"],
      ]),
    ),
  },
};

const processor = unified()
  .use(remarkParse)
  .use(remarkSourceLine)
  .use(remarkRehype, { allowDangerousHtml: false })
  .use(rehypeSanitize, schema)
  .use(rehypeStringify);

export function renderMarkdown(source: string): string {
  return processor.processSync(source).toString();
}

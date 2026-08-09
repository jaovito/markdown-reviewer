import { i18next } from "@/shared/i18n";
import rehypeSanitize from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { type Processor, unified } from "unified";
import { rehypeMermaid } from "./rehypeMermaid";
import { rehypeRepoAssets } from "./rehypeRepoAssets";
import { rehypeShiki } from "./rehypeShiki";
import { type AlertType, remarkGithubAlerts } from "./remarkGithubAlerts";
import { remarkSourceLine } from "./remarkSourceLine";
import { sanitizeSchema } from "./sanitizeSchema";

/**
 * Everything the preview needs to resolve a document's relative references.
 * Rendering without one is supported and yields the context-free output:
 * relative images and local links are left as-is (and then dropped by the
 * sanitizer), which is what the unit tests and any context-free caller want.
 */
export interface RenderContext {
  /** Absolute path of the local clone. */
  repoPath: string;
  /** PR head SHA — every relative reference resolves at this ref. */
  sha: string;
  /** Repo-relative path of the document being rendered. */
  filePath: string;
  /** Owner and repo, for building github.com/<owner>/<repo>/blob/… URLs. */
  owner: string;
  repo: string;
  /** The PR's changed files — decides in-app navigation vs. opening GitHub. */
  prFiles: readonly string[];
  /** Route prefix for in-app navigation, e.g. `/repo/o/r/pulls/12`. */
  basePath: string;
}

const labelForAlert = (type: AlertType): string => i18next.t(`markdownPreview.alerts.${type}`);

function build(ctx?: RenderContext): Processor {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkSourceLine)
    .use(remarkGithubAlerts, { label: labelForAlert })
    .use(remarkRehype, { allowDangerousHtml: false })
    .use(rehypeSlug)
    .use(rehypeMermaid);

  if (ctx) processor.use(rehypeRepoAssets, ctx);

  return (
    processor
      // Everything above this line handles untrusted author content.
      .use(rehypeSanitize, sanitizeSchema)
      // Everything below generates markup from already-escaped text.
      .use(rehypeShiki)
      .use(rehypeStringify) as Processor
  );
}

const contextFree = build();
/** One processor per context identity — a re-render must not rebuild the chain. */
const cache = new WeakMap<RenderContext, Processor>();

export function renderMarkdown(source: string, ctx?: RenderContext): string {
  if (!ctx) return contextFree.processSync(source).toString();
  let processor = cache.get(ctx);
  if (!processor) {
    processor = build(ctx);
    cache.set(ctx, processor);
  }
  return processor.processSync(source).toString();
}

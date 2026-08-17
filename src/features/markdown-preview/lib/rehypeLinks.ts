import type { Element, Root } from "hast";
import type { Plugin } from "unified";
import { visit } from "unist-util-visit";
import type { RenderContext } from "./pipeline";
import { resolveRepoPath } from "./resolveRepoPath";

export type LinkKind = "internal" | "github" | "external" | "inert" | "anchor";

const MARKDOWN_EXT = /\.(md|mdx|markdown)$/i;

function githubBlobUrl(ctx: RenderContext, path: string): string {
  return `https://github.com/${ctx.owner}/${ctx.repo}/blob/${ctx.sha}/${path}`;
}

/**
 * Classifies every anchor so the delegated click handler in `MarkdownPreview`
 * knows what to do with it.
 *
 * The rule is one sentence: what we can render here navigates here, and what
 * we cannot opens on GitHub. Markdown files that are part of the PR navigate
 * in-app; anything else — a Markdown file outside the diff, a `.png`, a
 * `.ts` — opens `github.com/<owner>/<repo>/blob/<sha>/<path>` in the system
 * browser without moving the app off the file under review.
 *
 * Out-of-PR files deliberately do not navigate in-app: GitHub rejects review
 * comments on files outside the diff, so rendering one in the commenting UI
 * would let a reviewer write a draft that can never be submitted.
 */
export const rehypeLinks: Plugin<[RenderContext], Root> = (ctx) => {
  return (tree) => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "a") return;
      const href = node.properties?.href;
      if (typeof href !== "string" || href === "") return;

      const set = (kind: LinkKind, props: Record<string, string | undefined>) => {
        node.properties = { ...node.properties, "data-link-kind": kind, ...props };
      };

      // Intra-document anchor. Under HashRouter an unhandled click rewrites
      // the route instead of scrolling, so the handler intercepts these.
      if (href.startsWith("#")) {
        set("anchor", { "data-href": href.slice(1) });
        return;
      }

      if (/^https?:/i.test(href)) {
        set("external", { rel: "noopener noreferrer" });
        return;
      }

      if (/^mailto:/i.test(href)) return; // plain link, nothing to intercept

      // Any other explicit scheme (file:, javascript:, custom) is inert. The
      // sanitizer would drop the href anyway; marking it lets CSS show the
      // reader that it is not actionable.
      if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//")) {
        set("inert", { href: undefined });
        return;
      }

      const hashIndex = href.indexOf("#");
      const fragment = hashIndex !== -1 ? href.slice(hashIndex) : "";

      const resolved = resolveRepoPath(ctx.filePath, href);
      if (!resolved) {
        set("inert", { href: undefined });
        return;
      }

      if (MARKDOWN_EXT.test(resolved) && ctx.prFiles.includes(resolved)) {
        // HashRouter resolves this natively — no JS needed.
        set("internal", { href: `#${ctx.basePath}/files/${resolved}${fragment}` });
        return;
      }

      set("github", { href: undefined, "data-href": `${githubBlobUrl(ctx, resolved)}${fragment}` });
    });
  };
};

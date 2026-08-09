import type { Element, Root } from "hast";
import type { Plugin } from "unified";
import { visit } from "unist-util-visit";
import type { RenderContext } from "./pipeline";
import { resolveRepoPath } from "./resolveRepoPath";

/** True for anything that already names its own origin. */
function isAbsolute(url: string): boolean {
  return url.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(url);
}

/** Builds the custom-scheme URL the Rust handler answers. */
export function assetUrl(ctx: RenderContext, path: string): string {
  const params = new URLSearchParams({ repo: ctx.repoPath, sha: ctx.sha, path });
  return `mdasset://localhost/?${params.toString()}`;
}

/**
 * Rewrites relative `<img src>` to the `mdasset://` scheme, which the Rust
 * side resolves at the PR head SHA — the same ref the Markdown itself was
 * read at, so the reviewer sees the image as it exists in the commit under
 * review rather than as it exists on whatever branch is checked out.
 *
 * Absolute and protocol-relative sources are left alone; the sanitize
 * allowlist then drops them, because a documentation preview has no business
 * making network requests. A source that escapes the repo root is dropped.
 */
export const rehypeRepoAssets: Plugin<[RenderContext], Root> = (ctx) => {
  return (tree) => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "img") return;
      const src = node.properties?.src;
      if (typeof src !== "string" || isAbsolute(src)) return;

      const resolved = resolveRepoPath(ctx.filePath, src);
      if (!resolved) {
        node.properties = { ...node.properties, src: undefined };
        return;
      }
      node.properties = { ...node.properties, src: assetUrl(ctx, resolved), loading: "lazy" };
    });
  };
};

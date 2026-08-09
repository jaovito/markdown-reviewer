/**
 * Resolves a Markdown-relative path against the repo root.
 *
 * `currentFile` is the repo-relative path of the document being rendered
 * (e.g. `docs/guide.md`); `target` is the raw href/src the author wrote.
 * Returns a normalized repo-relative path, or `null` when the target is not a
 * repo-relative path we can resolve (empty, or escaping the root).
 *
 * Escaping the root is rejected here for clarity of intent, not as the
 * security boundary — reads go through `git show <sha>:<path>`, which cannot
 * reach outside the tree object regardless of what we pass it.
 */
export function resolveRepoPath(currentFile: string, target: string): string | null {
  if (!target) return null;

  // Drop query and fragment; neither means anything to a git blob lookup.
  const clean = target.split("#")[0]?.split("?")[0] ?? "";
  if (!clean) return null;

  let decoded: string;
  try {
    decoded = decodeURIComponent(clean);
  } catch {
    return null; // Reject malformed percent-encoding
  }
  if (!decoded) return null;

  const rootRelative = decoded.startsWith("/");
  const base = rootRelative ? [] : currentFile.split("/").slice(0, -1);
  const segments = [...base, ...decoded.split("/")];

  const out: string[] = [];
  for (const segment of segments) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (out.length === 0) return null; // escaped the repo root
      out.pop();
      continue;
    }
    out.push(segment);
  }

  return out.length > 0 ? out.join("/") : null;
}

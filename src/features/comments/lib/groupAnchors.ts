import type { CommentAnchor, ReviewComment } from "@/shared/ipc/contract";

/** Returns the first source line a comment is *anchored to* visually. */
export function anchorStartLine(anchor: CommentAnchor): number {
  switch (anchor.kind) {
    case "singleLine":
      return anchor.line;
    case "lineRange":
    case "codeBlock":
      return anchor.startLine;
  }
}

/** Returns the last source line covered by the anchor. */
export function anchorEndLine(anchor: CommentAnchor): number {
  switch (anchor.kind) {
    case "singleLine":
      return anchor.line;
    case "lineRange":
    case "codeBlock":
      return anchor.endLine;
  }
}

export interface CommentGroup {
  /** The visual source line the group is keyed by (== startLine). */
  line: number;
  /** First source line covered by every comment in the group. */
  startLine: number;
  /** Last source line covered by every comment in the group. */
  endLine: number;
  /**
   * Source line of the DOM element to mount the comment slot under. For
   * multi-line ranges this is `endLine` so the card sits *after* the last
   * highlighted row.
   */
  attachLine: number;
  comments: ReviewComment[];
}

/**
 * Filters out hidden / resolved / deleted comments and buckets the rest by
 * `(startLine, endLine)`. Each bucket renders as one card; the head comment
 * decides the bucket's anchor extent.
 */
export function groupCommentsByStartLine(comments: ReviewComment[]): CommentGroup[] {
  const buckets = new Map<string, CommentGroup>();
  for (const c of comments) {
    if (c.state !== "draft" && c.state !== "submitted") continue;
    const startLine = anchorStartLine(c.anchor);
    const endLine = Math.max(startLine, anchorEndLine(c.anchor));
    const key = `${startLine}:${endLine}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.comments.push(c);
      continue;
    }
    buckets.set(key, {
      line: startLine,
      startLine,
      endLine,
      attachLine: endLine,
      comments: [c],
    });
  }
  for (const group of buckets.values()) {
    group.comments.sort((a, b) => a.createdAt - b.createdAt);
  }
  return Array.from(buckets.values()).sort((a, b) => {
    if (a.startLine !== b.startLine) return a.startLine - b.startLine;
    return a.endLine - b.endLine;
  });
}

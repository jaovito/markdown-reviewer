import type { CommentAnchor, RemoteThread, ReviewComment } from "@/shared/ipc/contract";

export type MergedEntry =
  | { kind: "remote"; key: string; filePath: string; startLine: number; thread: RemoteThread }
  | { kind: "local"; key: string; filePath: string; startLine: number; comment: ReviewComment };

function anchorStart(anchor: CommentAnchor): number {
  return anchor.kind === "singleLine" ? anchor.line : anchor.startLine;
}

/**
 * Merges local comments and mapped remote threads into a stable ordered list.
 * Any local comment whose `githubId` matches a `RemoteComment.commentId` is
 * dropped — the remote thread carries the richer data (replies, viewerCan*,
 * resolved state), so showing both would be a confusing duplicate.
 *
 * Sort key: filePath, then anchor start line, then a stable tiebreaker
 * (`threadId` for remote, `id` for local).
 */
export function mergeLocalAndRemote(local: ReviewComment[], remote: RemoteThread[]): MergedEntry[] {
  const remoteCommentIds = new Set<number>();
  for (const thread of remote) {
    for (const c of thread.comments) remoteCommentIds.add(c.commentId);
  }

  const entries: MergedEntry[] = [];

  for (const thread of remote) {
    if (!thread.anchor) continue; // unmapped goes elsewhere
    entries.push({
      kind: "remote",
      key: `remote:${thread.threadId}`,
      filePath: thread.path,
      startLine: anchorStart(thread.anchor),
      thread,
    });
  }

  for (const comment of local) {
    if (comment.githubId !== null && remoteCommentIds.has(comment.githubId)) continue;
    entries.push({
      kind: "local",
      key: `local:${comment.id}`,
      filePath: comment.filePath,
      startLine: anchorStart(comment.anchor),
      comment,
    });
  }

  entries.sort((a, b) => {
    if (a.filePath !== b.filePath) return a.filePath.localeCompare(b.filePath);
    if (a.startLine !== b.startLine) return a.startLine - b.startLine;
    return a.key.localeCompare(b.key);
  });

  return entries;
}

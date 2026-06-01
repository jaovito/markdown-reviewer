import type { RefreshResult, RemoteThread } from "@/shared/ipc/contract";

/**
 * Locates the remote thread that contains the comment with the given
 * REST `comment_id`. Used to bridge a local "submitted" comment (which
 * only knows its `githubId`) to the thread node id required by the
 * resolve / unresolve / reply mutations.
 */
export function findThreadByCommentId(
  cache: RefreshResult | null | undefined,
  githubId: number,
): RemoteThread | undefined {
  if (!cache) return undefined;
  for (const thread of cache.threads) {
    if (thread.comments.some((c) => c.commentId === githubId)) return thread;
  }
  for (const thread of cache.unmapped) {
    if (thread.comments.some((c) => c.commentId === githubId)) return thread;
  }
  return undefined;
}

import { ipc } from "@/shared/ipc/client";
import type { RefreshResult } from "@/shared/ipc/contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { showMutationError } from "../lib/showError";
import { remoteThreadsKey } from "./useRemoteThreads";

interface Vars {
  repoPath: string;
  prNumber: number;
  threadId: string;
  commentId: number;
}

export function useDeleteRemoteComment() {
  const qc = useQueryClient();
  return useMutation<void, Error, Vars>({
    mutationFn: async ({ repoPath, commentId }) => {
      const result = await ipc.sync.delete(repoPath, commentId);
      if (!result.ok) throw result.error;
    },
    onSuccess: (_void, { repoPath, prNumber, threadId, commentId }) => {
      // Walk both buckets so a delete on a thread whose anchor went
      // unmapped also drops the comment from the cache.
      const dropComment = (t: import("@/shared/ipc/contract").RemoteThread) =>
        t.threadId === threadId
          ? { ...t, comments: t.comments.filter((c) => c.commentId !== commentId) }
          : t;
      qc.setQueryData<RefreshResult | null>(remoteThreadsKey(repoPath, prNumber), (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          // Drop the thread when its last comment is gone — matches what
          // GitHub does on the web.
          threads: prev.threads.map(dropComment).filter((t) => t.comments.length > 0),
          unmapped: prev.unmapped.map(dropComment).filter((t) => t.comments.length > 0),
        };
      });
    },
    onError: showMutationError,
  });
}

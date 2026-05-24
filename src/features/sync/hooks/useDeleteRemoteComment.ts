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
      qc.setQueryData<RefreshResult | null>(remoteThreadsKey(repoPath, prNumber), (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          threads: prev.threads
            .map((t) =>
              t.threadId === threadId
                ? { ...t, comments: t.comments.filter((c) => c.commentId !== commentId) }
                : t,
            )
            // Drop the thread when its last comment is gone — matches what
            // GitHub does on the web.
            .filter((t) => t.comments.length > 0),
        };
      });
    },
    onError: showMutationError,
  });
}

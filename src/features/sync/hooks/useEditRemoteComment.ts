import { ipc } from "@/shared/ipc/client";
import type { RefreshResult, RemoteComment } from "@/shared/ipc/contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { showMutationError } from "../lib/showError";
import { remoteThreadsKey } from "./useRemoteThreads";

interface Vars {
  repoPath: string;
  prNumber: number;
  threadId: string;
  commentId: number;
  body: string;
}

export function useEditRemoteComment() {
  const qc = useQueryClient();
  return useMutation<RemoteComment, Error, Vars>({
    mutationFn: async ({ repoPath, commentId, body }) => {
      const result = await ipc.sync.edit(repoPath, commentId, body);
      if (!result.ok) throw result.error;
      return result.value;
    },
    onSuccess: (updated, { repoPath, prNumber, threadId, commentId }) => {
      qc.setQueryData<RefreshResult | null>(remoteThreadsKey(repoPath, prNumber), (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          threads: prev.threads.map((t) =>
            t.threadId === threadId
              ? {
                  ...t,
                  comments: t.comments.map((c) => (c.commentId === commentId ? updated : c)),
                }
              : t,
          ),
        };
      });
    },
    onError: showMutationError,
  });
}

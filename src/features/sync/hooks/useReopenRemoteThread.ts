import { ipc } from "@/shared/ipc/client";
import type { RefreshResult, RemoteThread } from "@/shared/ipc/contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { remoteThreadsKey } from "./useRemoteThreads";

interface Vars {
  repoPath: string;
  prNumber: number;
  threadId: string;
}

export function useReopenRemoteThread() {
  const qc = useQueryClient();
  return useMutation<RemoteThread, Error, Vars>({
    mutationFn: async ({ repoPath, threadId }) => {
      const result = await ipc.sync.reopen(repoPath, threadId);
      if (!result.ok) throw result.error;
      return result.value;
    },
    onSuccess: (updated, { repoPath, prNumber }) => {
      qc.setQueryData<RefreshResult | null>(remoteThreadsKey(repoPath, prNumber), (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          threads: prev.threads.map((t) => (t.threadId === updated.threadId ? updated : t)),
        };
      });
    },
  });
}

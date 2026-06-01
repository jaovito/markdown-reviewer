import { ipc } from "@/shared/ipc/client";
import type { RefreshResult } from "@/shared/ipc/contract";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface Options {
  repoPath?: string;
  prNumber?: number;
  headSha?: string;
}

export function remoteThreadsKey(repoPath: string, prNumber: number) {
  return ["remote-threads", repoPath, prNumber] as const;
}

/**
 * Loads remote review threads for `(repoPath, prNumber)`. On mount we read
 * the SQLite cache; the user must click Refresh to hit GitHub. Both the
 * initial cache read and the manual refresh return the same `RefreshResult`
 * shape so the consumer doesn't care which path produced it.
 */
export function useRemoteThreads({ repoPath, prNumber, headSha }: Options) {
  const qc = useQueryClient();
  const enabled = Boolean(repoPath && prNumber !== undefined);
  const query = useQuery<RefreshResult | null>({
    queryKey:
      enabled && repoPath && prNumber !== undefined
        ? remoteThreadsKey(repoPath, prNumber)
        : ["remote-threads", "disabled"],
    enabled,
    staleTime: Number.POSITIVE_INFINITY, // never auto-refetch — refresh is explicit
    queryFn: async () => {
      if (!repoPath || prNumber === undefined) return null;
      const result = await ipc.sync.getCached(repoPath, prNumber);
      if (!result.ok) throw result.error;
      return result.value;
    },
  });

  const refresh = async (): Promise<RefreshResult | null> => {
    if (!repoPath || prNumber === undefined || !headSha) return null;
    const result = await ipc.sync.refresh(repoPath, prNumber, headSha);
    if (!result.ok) throw result.error;
    qc.setQueryData(remoteThreadsKey(repoPath, prNumber), result.value);
    return result.value;
  };

  return { ...query, refresh };
}

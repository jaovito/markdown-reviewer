import { ipc } from "@/shared/ipc/client";
import type { RefreshResult } from "@/shared/ipc/contract";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

interface Options {
  repoPath?: string;
  prNumber?: number;
  headSha?: string;
}

/** How often the comments pane polls GitHub for new/updated review threads. */
export const REMOTE_THREADS_REFRESH_INTERVAL_MS = 10_000;

export function remoteThreadsKey(repoPath: string, prNumber: number) {
  return ["remote-threads", repoPath, prNumber] as const;
}

/**
 * Loads remote review threads for `(repoPath, prNumber)`. Comments are pulled
 * from GitHub automatically: a fresh fetch fires as soon as the document opens
 * (once `headSha` is known) and then every
 * `REMOTE_THREADS_REFRESH_INTERVAL_MS` while the window is focused. The SQLite
 * cache is used only as a fast fallback before `headSha` resolves. Both
 * consumers (header + threads pane) share one query by key, so React Query
 * dedupes the round-trips — there is no double polling. `isFetching` reflects
 * the live GitHub call so the Refresh button can spin during every update.
 */
export function useRemoteThreads({ repoPath, prNumber, headSha }: Options) {
  const enabled = Boolean(repoPath && prNumber !== undefined);
  const query = useQuery<RefreshResult | null>({
    queryKey:
      enabled && repoPath && prNumber !== undefined
        ? remoteThreadsKey(repoPath, prNumber)
        : ["remote-threads", "disabled"],
    enabled,
    staleTime: REMOTE_THREADS_REFRESH_INTERVAL_MS,
    // Only poll once we can actually hit GitHub (headSha known); before that
    // the queryFn would just re-read the local cache, which is pointless.
    refetchInterval: headSha ? REMOTE_THREADS_REFRESH_INTERVAL_MS : false,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      if (!repoPath || prNumber === undefined) return null;
      // Hit GitHub when we know the head sha; otherwise fall back to the
      // cache so the pane paints instantly while the PR detail still loads.
      if (headSha) {
        const result = await ipc.sync.refresh(repoPath, prNumber, headSha);
        if (!result.ok) throw result.error;
        return result.value;
      }
      const cached = await ipc.sync.getCached(repoPath, prNumber);
      if (!cached.ok) throw cached.error;
      return cached.value;
    },
  });

  // `headSha` isn't part of the query key (it resolves asynchronously, after
  // the first cache paint), so pull a fresh GitHub copy the moment it lands.
  // Concurrent refetches across the two consumers dedupe to a single request.
  const { refetch } = query;
  useEffect(() => {
    if (enabled && headSha) void refetch();
  }, [enabled, headSha, refetch]);

  const refresh = async (): Promise<RefreshResult | null> => {
    const result = await refetch();
    return result.data ?? null;
  };

  return { ...query, refresh };
}

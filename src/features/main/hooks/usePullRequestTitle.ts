import { ipc } from "@/shared/ipc/client";
import type { AppError } from "@/shared/ipc/contract";
import { useQuery } from "@tanstack/react-query";

/**
 * Lightweight title lookup used by `AppHeader`. Reuses the same React
 * Query keys as `usePullRequestDetail` and `useRepoPath` so opening the
 * PR detail page doesn't trigger a duplicate fetch.
 */
export function usePullRequestTitle(
  owner: string | undefined,
  repo: string | undefined,
  prNumber: number | undefined,
) {
  const repoPath = useQuery<string | null, AppError>({
    queryKey: ["repo-path", owner, repo],
    enabled: Boolean(owner && repo),
    queryFn: async () => {
      const res = await ipc.recents.list();
      if (!res.ok) throw res.error;
      return res.value.find((r) => r.owner === owner && r.repo === repo)?.path ?? null;
    },
  });

  return useQuery<string, AppError>({
    queryKey: ["pull-request", repoPath.data, prNumber],
    enabled: Boolean(repoPath.data && prNumber),
    queryFn: async () => {
      const res = await ipc.pullRequests.load(repoPath.data as string, prNumber as number);
      if (!res.ok) throw res.error;
      return res.value.summary.title;
    },
  });
}

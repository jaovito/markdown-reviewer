import { ipc } from "@/shared/ipc/client";
import type { AppError, PullRequestDetail } from "@/shared/ipc/contract";
import { useQuery } from "@tanstack/react-query";

/**
 * Title lookup used by `AppHeader`. Shares its queryKey AND queryFn shape
 * with `usePullRequestDetail` so the cache holds a single `PullRequestDetail`
 * per PR — opening the detail page reuses what we already fetched, and the
 * detail page's downstream consumers (`headSha`, etc.) keep working.
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

  return useQuery<PullRequestDetail, AppError, string>({
    queryKey: ["pull-request", repoPath.data, prNumber],
    enabled: Boolean(repoPath.data && prNumber),
    queryFn: async () => {
      const res = await ipc.pullRequests.load(repoPath.data as string, prNumber as number);
      if (!res.ok) throw res.error;
      return res.value;
    },
    select: (detail) => detail.summary.title,
  });
}

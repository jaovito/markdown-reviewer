import { ipc } from "@/shared/ipc/client";
import type { AppError, PullRequestSummary } from "@/shared/ipc/contract";
import { useQuery } from "@tanstack/react-query";

export function usePullRequests(repoPath: string | undefined) {
  return useQuery<PullRequestSummary[], AppError>({
    queryKey: ["pull-requests", repoPath],
    enabled: Boolean(repoPath),
    queryFn: async () => {
      const res = await ipc.pullRequests.list(repoPath as string);
      if (!res.ok) throw res.error;
      return res.value;
    },
  });
}

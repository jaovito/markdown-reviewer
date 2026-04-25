import { ipc } from "@/shared/ipc/client";
import type { AppError, PullRequestDetail } from "@/shared/ipc/contract";
import { useQuery } from "@tanstack/react-query";

export function usePullRequestDetail(repoPath: string | undefined, prNumber: number | undefined) {
  return useQuery<PullRequestDetail, AppError>({
    queryKey: ["pull-request", repoPath, prNumber],
    enabled: Boolean(repoPath && prNumber),
    queryFn: async () => {
      const res = await ipc.pullRequests.load(repoPath as string, prNumber as number);
      if (!res.ok) throw res.error;
      return res.value;
    },
  });
}

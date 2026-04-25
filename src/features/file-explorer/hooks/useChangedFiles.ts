import { ipc } from "@/shared/ipc/client";
import type { AppError, ChangedFile } from "@/shared/ipc/contract";
import { useQuery } from "@tanstack/react-query";

export function useChangedFiles(repoPath: string | undefined, prNumber: number | undefined) {
  return useQuery<ChangedFile[], AppError>({
    queryKey: ["changed-files", repoPath, prNumber],
    enabled: Boolean(repoPath && prNumber),
    queryFn: async () => {
      const res = await ipc.pullRequests.changedFiles(repoPath as string, prNumber as number);
      if (!res.ok) throw res.error;
      return res.value;
    },
  });
}

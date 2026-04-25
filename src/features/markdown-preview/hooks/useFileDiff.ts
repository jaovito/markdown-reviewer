import { ipc } from "@/shared/ipc/client";
import type { AppError, FileDiff } from "@/shared/ipc/contract";
import { useQuery } from "@tanstack/react-query";

interface Args {
  repoPath: string | undefined;
  prNumber: number | undefined;
  filePath: string | undefined;
}

export function useFileDiff({ repoPath, prNumber, filePath }: Args) {
  return useQuery<FileDiff, AppError>({
    queryKey: ["file-diff", repoPath, prNumber, filePath],
    enabled: Boolean(repoPath && prNumber && filePath),
    queryFn: async () => {
      const res = await ipc.pullRequests.fileDiff(
        repoPath as string,
        prNumber as number,
        filePath as string,
      );
      if (!res.ok) throw res.error;
      return res.value;
    },
  });
}

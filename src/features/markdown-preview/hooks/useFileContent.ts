import { ipc } from "@/shared/ipc/client";
import type { AppError } from "@/shared/ipc/contract";
import { useQuery } from "@tanstack/react-query";

interface Args {
  repoPath: string | undefined;
  sha: string | undefined;
  filePath: string | undefined;
}

export function useFileContent({ repoPath, sha, filePath }: Args) {
  return useQuery<string, AppError>({
    queryKey: ["file-content", repoPath, sha, filePath],
    enabled: Boolean(repoPath && sha && filePath),
    queryFn: async () => {
      const res = await ipc.files.readMarkdown(
        repoPath as string,
        sha as string,
        filePath as string,
      );
      if (!res.ok) throw res.error;
      return res.value;
    },
  });
}

import { ipc } from "@/shared/ipc/client";
import type { AppError } from "@/shared/ipc/contract";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

interface UseFileSourceResult {
  lines: string[] | null;
  isLoading: boolean;
  error: AppError | null;
}

export function useFileSource(
  repoPath: string | undefined,
  sha: string | undefined,
  filePath: string,
): UseFileSourceResult {
  const enabled = Boolean(repoPath && sha && filePath);
  const query = useQuery<string, AppError>({
    queryKey: ["file-source", repoPath, sha, filePath],
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 5 * 60_000,
    queryFn: async () => {
      const res = await ipc.files.readMarkdown(repoPath as string, sha as string, filePath);
      if (!res.ok) throw res.error;
      return res.value;
    },
  });

  const lines = useMemo(() => (query.data ? query.data.split("\n") : null), [query.data]);

  return {
    lines,
    isLoading: query.isLoading,
    error: query.error ?? null,
  };
}

import { ipc } from "@/shared/ipc/client";
import type { AppError, RemoteRepository, Repository } from "@/shared/ipc/contract";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function useRemoteRepos(query?: string) {
  return useQuery<RemoteRepository[], AppError>({
    queryKey: ["remote-repos", query],
    queryFn: async () => {
      const res = await ipc.remoteRepos.list(query);
      if (!res.ok) throw res.error;
      return res.value;
    },
    staleTime: 60_000,
  });
}

export function useCloneRepo() {
  const qc = useQueryClient();

  return useMutation<
    Repository | null,
    AppError,
    { repoNameWithOwner: string; targetParentDir: string }
  >({
    mutationFn: async ({ repoNameWithOwner, targetParentDir }) => {
      const res = await ipc.remoteRepos.clone(repoNameWithOwner, targetParentDir);
      if (!res.ok) throw res.error;
      return res.value;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recent-repos"] });
    },
  });
}

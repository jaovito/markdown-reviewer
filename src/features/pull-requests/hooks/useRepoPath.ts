import { ipc } from "@/shared/ipc/client";
import type { AppError, RecentRepository } from "@/shared/ipc/contract";
import { useQuery } from "@tanstack/react-query";

/**
 * Resolves the local filesystem path for a repository identified in the URL by
 * `owner/repo`. We look it up in the recents store so the user doesn't have to
 * re-pick a folder on reload.
 */
export function useRepoPath(owner: string | undefined, repo: string | undefined) {
  return useQuery<string | null, AppError>({
    queryKey: ["repo-path", owner, repo],
    enabled: Boolean(owner && repo),
    queryFn: async () => {
      const res = await ipc.recents.list();
      if (!res.ok) throw res.error;
      const match = res.value.find((r: RecentRepository) => r.owner === owner && r.repo === repo);
      return match?.path ?? null;
    },
  });
}

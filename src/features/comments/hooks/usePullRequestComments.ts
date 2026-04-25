import { ipc } from "@/shared/ipc/client";
import type { AppError, ReviewComment } from "@/shared/ipc/contract";
import { useQuery } from "@tanstack/react-query";

/**
 * Fetches every local comment that belongs to a pull request. Used by the
 * threads pane to hydrate state on app start; the same query key is invalidated
 * by `useCreateComment` so writes propagate without manual refetching.
 */
export function usePullRequestComments(prNumber: number | undefined) {
  return useQuery<ReviewComment[], AppError>({
    queryKey: ["local-comments", prNumber],
    enabled: prNumber !== undefined,
    queryFn: async () => {
      const res = await ipc.comments.list(prNumber as number);
      if (!res.ok) throw res.error;
      return res.value;
    },
  });
}

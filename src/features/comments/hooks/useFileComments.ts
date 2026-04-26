import { ipc } from "@/shared/ipc/client";
import type { AppError, ReviewComment } from "@/shared/ipc/contract";
import { useQuery } from "@tanstack/react-query";

interface Args {
  prNumber: number | undefined;
  filePath: string | undefined;
}

/**
 * Fetches local comments for a single file in a PR. Shares its query key
 * shape with the threads pane so mutations can invalidate both.
 */
export function useFileComments({ prNumber, filePath }: Args) {
  return useQuery<ReviewComment[], AppError>({
    queryKey: ["local-comments", prNumber, filePath],
    enabled: Boolean(prNumber && filePath),
    queryFn: async () => {
      const res = await ipc.comments.listForFile(prNumber as number, filePath as string);
      if (!res.ok) throw res.error;
      return res.value;
    },
  });
}

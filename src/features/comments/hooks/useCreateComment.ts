import { ipc } from "@/shared/ipc/client";
import type { AppError, CommentAnchor, ReviewComment } from "@/shared/ipc/contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";

interface CreateArgs {
  prNumber: number;
  filePath: string;
  headSha: string;
  body: string;
  anchor: CommentAnchor;
  author?: string | null;
}

/**
 * Wraps `ipc.comments.create` and invalidates both the per-PR and per-file
 * comment query keys so the threads pane and inline markers refresh together.
 */
export function useCreateComment() {
  const qc = useQueryClient();
  return useMutation<ReviewComment, AppError, CreateArgs>({
    mutationFn: async ({ prNumber, filePath, headSha, body, anchor, author = null }) => {
      const res = await ipc.comments.create({ prNumber, filePath, headSha, body, author, anchor });
      if (!res.ok) throw res.error;
      return res.value;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["local-comments", vars.prNumber] });
      qc.invalidateQueries({ queryKey: ["local-comments", vars.prNumber, vars.filePath] });
    },
  });
}

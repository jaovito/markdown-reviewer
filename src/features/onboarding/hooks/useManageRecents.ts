import { ipc } from "@/shared/ipc/client";
import type { AppError } from "@/shared/ipc/contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export function usePinRecent() {
  const qc = useQueryClient();
  return useMutation<void, AppError, { path: string; pinned: boolean }>({
    mutationFn: async ({ path, pinned }) => {
      const res = await ipc.recents.pin(path, pinned);
      if (!res.ok) throw res.error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recent-repos"] });
    },
  });
}

export function useClearRecents() {
  const qc = useQueryClient();
  return useMutation<void, AppError, void>({
    mutationFn: async () => {
      const res = await ipc.recents.clear();
      if (!res.ok) throw res.error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recent-repos"] });
    },
  });
}

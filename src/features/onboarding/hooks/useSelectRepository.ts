import { ipc } from "@/shared/ipc/client";
import type { AppError, Repository } from "@/shared/ipc/contract";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function useRecents() {
  return useQuery({
    queryKey: ["recent-repos"],
    queryFn: async () => {
      const res = await ipc.recents.list();
      if (!res.ok) throw res.error;
      return res.value;
    },
  });
}

export function useSelectRepository() {
  const qc = useQueryClient();

  return useMutation<Repository | null, AppError, string | undefined>({
    mutationFn: async (pathOverride) => {
      let path = pathOverride;
      if (!path) {
        const picked = await ipc.repo.select();
        if (!picked.ok) throw picked.error;
        if (!picked.value) return null;
        path = picked.value;
      }
      const validated = await ipc.repo.validate(path);
      if (!validated.ok) throw validated.error;

      const added = await ipc.recents.add(validated.value);
      if (!added.ok) throw added.error;

      return validated.value;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recent-repos"] });
    },
  });
}

export function useRemoveRecent() {
  const qc = useQueryClient();
  return useMutation<void, AppError, string>({
    mutationFn: async (path) => {
      const res = await ipc.recents.remove(path);
      if (!res.ok) throw res.error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recent-repos"] });
    },
  });
}

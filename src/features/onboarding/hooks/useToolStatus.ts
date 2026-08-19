import { ipc } from "@/shared/ipc/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function useToolStatus() {
  return useQuery({
    queryKey: ["tool-status"],
    queryFn: async () => {
      const res = await ipc.tools.check();
      if (!res.ok) throw res.error;
      return res.value;
    },
  });
}

export function useLoginGh() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await ipc.tools.loginGh();
      if (!res.ok) throw res.error;
      return res.value;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tool-status"] });
    },
  });
}

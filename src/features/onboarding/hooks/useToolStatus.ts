import { ipc } from "@/shared/ipc/client";
import { useQuery } from "@tanstack/react-query";

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

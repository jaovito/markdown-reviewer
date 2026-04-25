import { ipc } from "@/shared/ipc/client";
import type { AppError } from "@/shared/ipc/contract";
import { useQuery } from "@tanstack/react-query";

/**
 * Returns the authenticated GitHub username (from `gh auth status`). Used to
 * stamp the `author` field on freshly created local comments. Falls back to
 * `null` when the user isn't logged in or the call fails.
 */
export function useGhUser() {
  return useQuery<string | null, AppError>({
    queryKey: ["gh-user"],
    // The username is stable across an app session — no need to re-fetch
    // unless the user explicitly invalidates.
    staleTime: 1000 * 60 * 60,
    retry: false,
    queryFn: async () => {
      const res = await ipc.tools.ghUser();
      if (!res.ok) return null;
      return res.value;
    },
  });
}

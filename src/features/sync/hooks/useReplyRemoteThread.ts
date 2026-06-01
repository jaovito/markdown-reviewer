import { ipc } from "@/shared/ipc/client";
import type { RefreshResult, RemoteComment, RemoteThread } from "@/shared/ipc/contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { showMutationError } from "../lib/showError";
import { remoteThreadsKey } from "./useRemoteThreads";

interface Vars {
  repoPath: string;
  prNumber: number;
  threadId: string;
  inReplyToCommentId: number;
  body: string;
}

export function useReplyRemoteThread() {
  const qc = useQueryClient();
  return useMutation<RemoteComment, Error, Vars>({
    mutationFn: async ({ repoPath, prNumber, inReplyToCommentId, body }) => {
      const result = await ipc.sync.reply(repoPath, prNumber, inReplyToCommentId, body);
      if (!result.ok) throw result.error;
      return result.value;
    },
    onSuccess: (added, { repoPath, prNumber, threadId }) => {
      qc.setQueryData<RefreshResult | null>(
        remoteThreadsKey(repoPath, prNumber),
        (prev) =>
          prev && patchThread(prev, threadId, (t) => ({ ...t, comments: [...t.comments, added] })),
      );
    },
    onError: showMutationError,
  });
}

function patchThread(
  prev: RefreshResult,
  threadId: string,
  patch: (t: RemoteThread) => RemoteThread,
): RefreshResult {
  // Walk both buckets — a reply to a thread whose anchor became unmapped
  // (file/line moved) still needs the optimistic cache update, otherwise
  // the new comment won't appear in the Unmapped section until the next
  // refresh.
  return {
    ...prev,
    threads: prev.threads.map((t) => (t.threadId === threadId ? patch(t) : t)),
    unmapped: prev.unmapped.map((t) => (t.threadId === threadId ? patch(t) : t)),
  };
}

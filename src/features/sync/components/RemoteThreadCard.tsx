import type { RemoteThread } from "@/shared/ipc/contract";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useDeleteRemoteComment } from "../hooks/useDeleteRemoteComment";
import { useEditRemoteComment } from "../hooks/useEditRemoteComment";
import { useReopenRemoteThread } from "../hooks/useReopenRemoteThread";
import { useReplyRemoteThread } from "../hooks/useReplyRemoteThread";
import { useResolveRemoteThread } from "../hooks/useResolveRemoteThread";
import { RemoteCommentBody } from "./RemoteCommentBody";
import { RemoteReplyComposer } from "./RemoteReplyComposer";

interface Props {
  thread: RemoteThread;
  repoPath: string;
  prNumber: number;
}

export function RemoteThreadCard({ thread, repoPath, prNumber }: Props) {
  const { t } = useTranslation();
  const reply = useReplyRemoteThread();
  const edit = useEditRemoteComment();
  const del = useDeleteRemoteComment();
  const resolve = useResolveRemoteThread();
  const reopen = useReopenRemoteThread();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingBody, setEditingBody] = useState("");

  const lastReplyTarget = thread.comments.at(-1)?.commentId ?? thread.comments[0]?.commentId;

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-3">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge tone={thread.state === "resolved" ? "success" : "default"}>
            {thread.state === "resolved"
              ? t("sync.thread.resolvedBadge")
              : t("sync.thread.openBadge")}
          </Badge>
          {thread.isOutdated ? (
            <Badge tone="warning">{t("sync.thread.outdatedBadge")}</Badge>
          ) : null}
        </div>
        {thread.state === "open" && thread.viewerCanResolve ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              console.log("[sync-debug] resolve click", {
                threadId: thread.threadId,
                viewerCanResolve: thread.viewerCanResolve,
              });
              resolve.mutate({ repoPath, prNumber, threadId: thread.threadId });
            }}
            disabled={resolve.isPending}
          >
            {t("sync.actions.resolve")}
          </Button>
        ) : null}
        {thread.state === "resolved" && thread.viewerCanUnresolve ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => reopen.mutate({ repoPath, prNumber, threadId: thread.threadId })}
            disabled={reopen.isPending}
          >
            {t("sync.actions.reopen")}
          </Button>
        ) : null}
      </header>

      <ol className="flex flex-col gap-2">
        {thread.comments.map((c) => (
          <li key={c.commentId}>
            {editingId === c.commentId ? (
              <form
                className="flex flex-col gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const trimmed = editingBody.trim();
                  if (!trimmed) return;
                  edit.mutate(
                    {
                      repoPath,
                      prNumber,
                      threadId: thread.threadId,
                      commentId: c.commentId,
                      body: trimmed,
                    },
                    { onSuccess: () => setEditingId(null) },
                  );
                }}
              >
                <textarea
                  className="min-h-20 rounded border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-2 text-sm"
                  value={editingBody}
                  onChange={(e) => setEditingBody(e.target.value)}
                />
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingId(null)}
                  >
                    {t("sync.actions.cancel")}
                  </Button>
                  <Button type="submit" size="sm" disabled={edit.isPending}>
                    {t("sync.actions.save")}
                  </Button>
                </div>
              </form>
            ) : (
              <RemoteCommentBody
                comment={c}
                onEdit={() => {
                  setEditingId(c.commentId);
                  setEditingBody(c.body);
                }}
                onDelete={() => {
                  if (window.confirm(t("sync.actions.deleteConfirm"))) {
                    del.mutate({
                      repoPath,
                      prNumber,
                      threadId: thread.threadId,
                      commentId: c.commentId,
                    });
                  }
                }}
              />
            )}
          </li>
        ))}
      </ol>

      {thread.state === "open" && lastReplyTarget !== undefined ? (
        <RemoteReplyComposer
          pending={reply.isPending}
          onSubmit={(body) => {
            console.log("[sync-debug] reply mutate", {
              threadId: thread.threadId,
              inReplyToCommentId: lastReplyTarget,
              bodyLen: body.length,
            });
            reply.mutate({
              repoPath,
              prNumber,
              threadId: thread.threadId,
              inReplyToCommentId: lastReplyTarget,
              body,
            });
          }}
        />
      ) : null}
    </section>
  );
}

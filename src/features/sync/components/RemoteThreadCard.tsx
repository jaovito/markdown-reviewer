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
  /**
   * When set, the file:line breadcrumb at the top of the card becomes a
   * button that calls back with the thread's anchor — used by the threads
   * pane to jump from the right rail into the rendered markdown.
   */
  onNavigate?: (filePath: string, line: number) => void;
}

export function RemoteThreadCard({ thread, repoPath, prNumber, onNavigate }: Props) {
  const { t } = useTranslation();
  const reply = useReplyRemoteThread();
  const edit = useEditRemoteComment();
  const del = useDeleteRemoteComment();
  const resolve = useResolveRemoteThread();
  const reopen = useReopenRemoteThread();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingBody, setEditingBody] = useState("");

  const lastReplyTarget = thread.comments.at(-1)?.commentId ?? thread.comments[0]?.commentId;
  const anchorLine =
    thread.anchor?.kind === "singleLine"
      ? thread.anchor.line
      : (thread.anchor?.startLine ?? thread.line ?? thread.originalLine);

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-3">
      {onNavigate ? (
        <button
          type="button"
          onClick={() => onNavigate(thread.path, anchorLine)}
          className="flex items-baseline gap-1.5 self-start rounded px-1 py-0.5 text-left text-[11px] text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--accent))]/40 hover:text-[hsl(var(--foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
        >
          <span className="truncate font-medium">{thread.path}</span>
          <span className="font-mono">L{anchorLine}</span>
        </button>
      ) : null}
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

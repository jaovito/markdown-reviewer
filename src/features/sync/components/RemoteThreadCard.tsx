import type { RemoteThread } from "@/shared/ipc/contract";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { TruncatedPath } from "@/shared/ui/truncated-path";
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
   * When set, the card becomes clickable as a whole — anywhere outside the
   * action buttons (Resolve / Reply / edit / delete / composer) calls back
   * with the thread's anchor so the right rail can jump into the rendered
   * markdown. Buttons inside the card stop propagation so they don't
   * also trigger navigation.
   */
  onNavigate?: (filePath: string, line: number) => void;
}

/** Stops a synthetic event from bubbling up to the card's clickable wrapper. */
const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

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

  const navigate = onNavigate ? () => onNavigate(thread.path, anchorLine) : undefined;
  // The whole card is wrapped in a div with onClick + role="button" so keyboard
  // users can also fire it via Space/Enter. The action buttons inside call
  // `stop()` on their click handlers so they don't also trigger navigation.
  const wrapperProps = navigate
    ? {
        onClick: navigate,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            navigate();
          }
        },
        role: "button" as const,
        tabIndex: 0,
        "aria-label": t("sync.actions.openInPreview", {
          path: thread.path,
          line: anchorLine,
        }),
        className:
          "flex cursor-pointer flex-col gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-3 transition-colors hover:border-[hsl(var(--foreground))]/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
      }
    : {
        className:
          "flex flex-col gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-3",
      };

  return (
    <div {...wrapperProps}>
      <header className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-baseline gap-1.5 text-[11px] text-[hsl(var(--muted-foreground))]">
          <TruncatedPath path={thread.path} className="flex-1 font-medium" />
          <span className="shrink-0 font-mono">L{anchorLine}</span>
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <Badge tone={thread.state === "resolved" ? "success" : "default"}>
            {thread.state === "resolved"
              ? t("sync.thread.resolvedBadge")
              : t("sync.thread.openBadge")}
          </Badge>
          {thread.isOutdated ? (
            <Badge tone="warning">{t("sync.thread.outdatedBadge")}</Badge>
          ) : null}
        </div>
      </header>

      <div className="flex items-center justify-end gap-2">
        {thread.state === "open" && thread.viewerCanResolve ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={(e) => {
              stop(e);
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
            onClick={(e) => {
              stop(e);
              reopen.mutate({ repoPath, prNumber, threadId: thread.threadId });
            }}
            disabled={reopen.isPending}
          >
            {t("sync.actions.reopen")}
          </Button>
        ) : null}
      </div>

      <ol className="flex flex-col gap-2">
        {thread.comments.map((c) => (
          <li key={c.commentId}>
            {editingId === c.commentId ? (
              <form
                className="flex flex-col gap-2"
                onClick={stop}
                onKeyDown={stop}
                onSubmit={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
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
                    onClick={(e) => {
                      stop(e);
                      setEditingId(null);
                    }}
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
        <div onClick={stop} onKeyDown={stop}>
          <RemoteReplyComposer
            pending={reply.isPending}
            onSubmit={(body) =>
              reply.mutate({
                repoPath,
                prNumber,
                threadId: thread.threadId,
                inReplyToCommentId: lastReplyTarget,
                body,
              })
            }
          />
        </div>
      ) : null}
    </div>
  );
}

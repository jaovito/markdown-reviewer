import type { CommentAnchor, CommentState, ReviewComment } from "@/shared/ipc/contract";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import { CheckIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useGhUser } from "../hooks/useGhUser";

interface InlineThreadCardProps {
  comments: ReviewComment[];
  /** When true, the thread is the currently selected one (clicked in pane). */
  selected?: boolean;
  onResolve?: (comment: ReviewComment) => void;
  onHide?: (comment: ReviewComment) => void;
  onReply?: (head: ReviewComment) => void;
  onDelete?: (comment: ReviewComment) => void;
}

function isRange(anchor: CommentAnchor): boolean {
  if (anchor.kind === "singleLine") return false;
  return anchor.startLine !== anchor.endLine;
}

function authorInitials(author: string | null): string {
  if (!author) return "?";
  const parts = author.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return (parts[0] ?? "").slice(0, 2).toUpperCase();
  const first = (parts[0] ?? "")[0] ?? "";
  const second = (parts[1] ?? "")[0] ?? "";
  return `${first}${second}`.toUpperCase();
}

function metaLabel(t: ReturnType<typeof useTranslation>["t"], head: ReviewComment): string {
  const author = head.author ?? t("comments.thread.anonAuthor");
  const a = head.anchor;
  if (a.kind === "singleLine") {
    return t("comments.thread.metaSingle", { author, line: a.line });
  }
  if (a.startLine === a.endLine) {
    return t("comments.thread.metaSingle", { author, line: a.startLine });
  }
  return t("comments.thread.metaRange", { author, start: a.startLine, end: a.endLine });
}

interface BadgeStyle {
  label: string;
  bgVar: string;
  fgVar: string;
}

function badgeFor(t: ReturnType<typeof useTranslation>["t"], state: CommentState): BadgeStyle {
  switch (state) {
    case "draft":
      return {
        label: t("comments.thread.badgeDraft"),
        bgVar: "--comment-draft-bg",
        fgVar: "--comment-draft-fg",
      };
    case "submitted":
      return {
        label: t("comments.thread.badgeOpen"),
        bgVar: "--comment-open-bg",
        fgVar: "--comment-open-fg",
      };
    case "resolved":
      return {
        label: t("comments.thread.badgeResolved"),
        bgVar: "--comment-open-bg",
        fgVar: "--comment-open-fg",
      };
    case "hidden":
    case "deleted":
      return {
        label: t(
          state === "hidden" ? "comments.thread.badgeHidden" : "comments.thread.badgeDeleted",
        ),
        bgVar: "--comment-range-bg",
        fgVar: "--comment-range-fg",
      };
  }
}

export function InlineThreadCard({
  comments,
  selected = false,
  onResolve,
  onHide,
  onReply,
  onDelete,
}: InlineThreadCardProps) {
  const { t } = useTranslation();
  const ghUser = useGhUser();
  const currentUser = ghUser.data ?? null;
  const isOwn = (c: ReviewComment) => Boolean(currentUser && c.author === currentUser);
  const head = comments[0];
  if (!head) return null;
  const isResolved = head.state === "resolved";
  const isHidden = head.state === "hidden";
  const range = isRange(head.anchor);
  const avatarBgVar = range ? "--comment-avatar-range-bg" : "--comment-avatar-bg";
  const cardBorderClass = range
    ? "border-[hsl(var(--comment-range-border))]"
    : "border-[hsl(var(--border))]";
  const badge = badgeFor(t, head.state);

  return (
    <div
      className={cn(
        "my-3 flex flex-col gap-1.5 rounded-lg border bg-[hsl(var(--card))] p-3 text-[hsl(var(--card-foreground))]",
        cardBorderClass,
        selected ? "shadow-sm ring-1 ring-[hsl(var(--foreground))]/20" : null,
        isResolved || isHidden ? "opacity-80" : null,
      )}
      data-thread-state={head.state}
    >
      <div className="flex items-center gap-2">
        <span
          className="inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[9px] font-semibold"
          style={{
            backgroundColor: `hsl(var(${avatarBgVar}))`,
            color: "hsl(var(--comment-avatar-fg))",
          }}
        >
          {authorInitials(head.author)}
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-[hsl(var(--foreground))]">
          {metaLabel(t, head)}
        </span>
        <span
          className="inline-flex h-6 shrink-0 items-center rounded-full px-2 text-[11px] font-medium"
          style={{
            backgroundColor: `hsl(var(${badge.bgVar}))`,
            color: `hsl(var(${badge.fgVar}))`,
          }}
        >
          {badge.label}
        </span>
      </div>

      {comments.map((c, idx) => (
        <div
          key={c.id}
          className={cn(
            "px-1 text-[12px] leading-snug text-[hsl(var(--foreground))]/85",
            idx === 0 ? "pt-0.5" : "mt-1 border-[hsl(var(--border))] border-t pt-2",
          )}
        >
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              {idx > 0 && c.author ? (
                <p className="mb-1 text-[11px] font-semibold text-[hsl(var(--foreground))]">
                  {c.author}
                </p>
              ) : null}
              <p className="whitespace-pre-wrap">{c.body}</p>
            </div>
            {onDelete && isOwn(c) ? (
              <button
                type="button"
                onClick={() => onDelete(c)}
                aria-label={t("comments.thread.deleteAria")}
                title={t("comments.thread.delete")}
                className={cn(
                  "shrink-0 rounded-md p-1 text-[hsl(var(--muted-foreground))]",
                  "transition-colors hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--destructive))]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
                )}
              >
                <Trash2Icon className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </div>
      ))}

      <div className="flex items-center justify-between gap-2 pt-1">
        <button
          type="button"
          onClick={() => onReply?.(head)}
          className="text-[12px] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
        >
          {t("comments.thread.reply")}
        </button>
        <div className="flex items-center gap-2">
          {!isResolved ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onResolve?.(head)}
              className={cn(
                "h-7 gap-1.5 rounded-md border-[hsl(var(--comment-resolve-border))] bg-[hsl(var(--comment-resolve-bg))]",
                "px-2.5 text-[12px] font-medium text-[hsl(var(--comment-resolve-fg))]",
                "hover:bg-[hsl(var(--comment-resolve-bg))]/80",
              )}
            >
              <CheckIcon className="h-3 w-3" aria-hidden="true" />
              <span>{t("comments.thread.resolve")}</span>
            </Button>
          ) : null}
          {!isHidden ? (
            <Button
              type="button"
              size="sm"
              onClick={() => onHide?.(head)}
              className="h-7 rounded-md px-3 text-[12px] font-medium"
            >
              {t("comments.thread.hide")}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

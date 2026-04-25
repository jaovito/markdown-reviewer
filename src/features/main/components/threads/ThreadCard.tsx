import type { ReviewComment } from "@/shared/ipc/contract";
import { cn } from "@/shared/lib/cn";
import { useTranslation } from "react-i18next";
import { AnchorLabel } from "./AnchorLabel";
import { StateBadge } from "./StateBadge";

const PREVIEW_LIMIT = 120;

export interface ThreadGroup {
  /**
   * Stable id derived from `filePath` + the anchor's `(startLine, endLine)`
   * extent — kept in lockstep with `groupByAnchor` in `ThreadList`. A
   * single-line and a multi-line range starting on the same line need
   * distinct keys so they render as separate cards.
   */
  key: string;
  filePath: string;
  startLine: number;
  comments: ReviewComment[];
}

interface ThreadCardProps {
  group: ThreadGroup;
  /** When true, the card is associated with the currently selected comment. */
  selected: boolean;
  /** When true, the card is showing comments from a single file context. */
  hideFilePath: boolean;
  onSelect: (comment: ReviewComment) => void;
}

export function ThreadCard({ group, selected, hideFilePath, onSelect }: ThreadCardProps) {
  const head = group.comments[0];
  const { t } = useTranslation();
  if (!head) return null;
  const replyCount = group.comments.length - 1;
  const isResolved = head.state === "resolved";
  return (
    <button
      type="button"
      onClick={() => onSelect(head)}
      className={cn(
        "flex w-full flex-col gap-2.5 rounded-lg border bg-[hsl(var(--card))] p-3 text-left text-sm transition-colors",
        "hover:border-[hsl(var(--foreground))]/30",
        selected ? "border-[hsl(var(--foreground))]/40 shadow-sm" : "border-[hsl(var(--border))]",
        isResolved ? "opacity-70" : null,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-[hsl(var(--foreground))]">
          <AnchorLabel filePath={group.filePath} anchor={head.anchor} lineOnly={hideFilePath} />
        </span>
        <StateBadge state={head.state} className="shrink-0" />
      </div>
      <p className="text-[12px] leading-snug text-[hsl(var(--muted-foreground))]">
        {truncateBody(head.body)}
      </p>
      <div className="flex items-center justify-between gap-2 text-[11px] text-[hsl(var(--muted-foreground))]">
        <span className="truncate">{head.author ?? t("comments.thread.anonAuthor")}</span>
        <span className="flex items-center gap-2">
          {replyCount > 0 ? (
            <span>
              {t("threads.row.replyCount", {
                count: replyCount,
                defaultValue: replyCount === 1 ? "1 reply" : `${replyCount} replies`,
              })}
            </span>
          ) : null}
          <RelativeTime ms={head.createdAt} />
        </span>
      </div>
    </button>
  );
}

function truncateBody(body: string): string {
  const trimmed = body.trim().replace(/\s+/g, " ");
  if (trimmed.length <= PREVIEW_LIMIT) return trimmed;
  return `${trimmed.slice(0, PREVIEW_LIMIT - 1)}…`;
}

function RelativeTime({ ms }: { ms: number }) {
  const { t, i18n } = useTranslation();
  const diff = Date.now() - ms;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  let label: string;
  if (diff < minute) {
    label = t("threads.row.justNow");
  } else if (diff < hour) {
    label = t("threads.row.minutesAgo", { n: Math.max(1, Math.round(diff / minute)) });
  } else if (diff < day) {
    label = t("threads.row.hoursAgo", { n: Math.round(diff / hour) });
  } else if (diff < 30 * day) {
    label = t("threads.row.daysAgo", { n: Math.round(diff / day) });
  } else {
    label = new Date(ms).toLocaleDateString(i18n.language);
  }
  return <time dateTime={new Date(ms).toISOString()}>{label}</time>;
}

import type { CommentAnchor, ReviewComment } from "@/shared/ipc/contract";
import { cn } from "@/shared/lib/cn";
import { RotateCcwIcon } from "lucide-react";
import { forwardRef } from "react";
import { useTranslation } from "react-i18next";
import { AnchorLabel } from "./AnchorLabel";
import { StateBadge } from "./StateBadge";
import { ThreadSnippet } from "./ThreadSnippet";

function rangeOf(anchor: CommentAnchor): { startLine: number; endLine: number } {
  if (anchor.kind === "singleLine") return { startLine: anchor.line, endLine: anchor.line };
  return { startLine: anchor.startLine, endLine: anchor.endLine };
}

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
  /**
   * When true, omit the anchor label entirely — the card is rendered inside a
   * wrapper group that already shows the file path and line range header, so
   * the per-card label would be redundant.
   */
  hideAnchorLabel?: boolean;
  /** Tab order for keyboard navigation; defaults to 0. */
  tabIndex?: number;
  /**
   * When true, the card behaves as an ARIA treeitem (used inside the
   * hierarchical threads panel). The wrapper container should provide
   * `role="tree"`. Outside that context the card is a plain button.
   */
  asTreeItem?: boolean;
  /** Forwarded to ThreadSnippet's `useFileSource` — undefined disables the snippet. */
  repoPath?: string;
  /** Head sha for the snippet's cache key. */
  sha?: string;
  /** Forwarded to the underlying row button — used to track roving-tabindex focus. */
  onFocus?: () => void;
  onSelect: (comment: ReviewComment) => void;
  /**
   * Optional `Reopen` action — surfaced when the row's head is `resolved` so
   * the user can flip it back without leaving the threads pane.
   */
  onReopen?: (comment: ReviewComment) => void;
}

/**
 * The forwarded ref reaches the *focusable* row `<button>` (not the wrapper
 * `<div>`), so callers can move keyboard focus to the card from outside —
 * required by the roving-tabindex inside the hierarchical threads panel.
 */
export const ThreadCard = forwardRef<HTMLButtonElement, ThreadCardProps>(function ThreadCard(
  {
    group,
    selected,
    hideFilePath,
    hideAnchorLabel = false,
    tabIndex,
    asTreeItem = false,
    repoPath,
    sha,
    onFocus,
    onSelect,
    onReopen,
  },
  ref,
) {
  const { startLine: snippetStart, endLine: snippetEnd } = group.comments[0]
    ? rangeOf(group.comments[0].anchor)
    : { startLine: 0, endLine: 0 };
  const head = group.comments[0];
  const { t } = useTranslation();
  if (!head) return null;
  const total = group.comments.length;
  const replyCount = total - 1;
  const isResolved = head.state === "resolved";
  // Selecting a multi-comment group expands the card into a stacked view —
  // each comment fully rendered, top-down. Single-comment groups stay in the
  // compact preview shape.
  const isStacked = selected && total > 1;
  const showReopen = isResolved && !!onReopen;
  // The row click target is a `<button>`, but resolved threads also surface a
  // `Reopen` action — `<button>` can't legally nest another `<button>`, so we
  // wrap the row in a positioned `<div>` and stack the action on top. The
  // wrapper carries `role="presentation"` so it doesn't appear between the
  // parent `tree`/`group` and the row's `treeitem` in the accessibility tree.
  return (
    <div role="presentation" className="relative">
      <button
        ref={ref}
        type="button"
        role={asTreeItem ? "treeitem" : undefined}
        aria-selected={asTreeItem ? selected : undefined}
        onClick={() => onSelect(head)}
        onFocus={onFocus}
        // `aria-expanded` on a treeitem implies it owns a `role="group"` of
        // child treeitems — which the card doesn't. Suppress it inside the
        // tree; outside the tree it still flags the stacked-preview state.
        aria-expanded={asTreeItem ? undefined : isStacked || undefined}
        tabIndex={tabIndex}
        className={cn(
          "flex w-full flex-col gap-2.5 rounded-lg border bg-[hsl(var(--card))] p-3 text-left text-sm transition-colors",
          "hover:border-[hsl(var(--foreground))]/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
          selected ? "border-[hsl(var(--foreground))]/40 shadow-sm" : "border-[hsl(var(--border))]",
          isResolved ? "opacity-70" : null,
        )}
      >
        {hideAnchorLabel ? (
          <div className="flex items-start justify-end gap-2">
            <StateBadge state={head.state} className="shrink-0" />
          </div>
        ) : (
          <div className="flex items-start justify-between gap-2">
            <span className="min-w-0 flex-1 text-[12px] font-medium text-[hsl(var(--foreground))]">
              <AnchorLabel filePath={group.filePath} anchor={head.anchor} lineOnly={hideFilePath} />
            </span>
            <StateBadge state={head.state} className="shrink-0" />
          </div>
        )}
        <ThreadSnippet
          repoPath={repoPath}
          sha={sha}
          filePath={group.filePath}
          startLine={snippetStart}
          endLine={snippetEnd}
        />
        {isStacked ? (
          <>
            <p className="text-[11px] font-medium text-[hsl(var(--muted-foreground))]">
              {t("threads.row.stackedCount", { count: total })}
            </p>
            <ul className="flex flex-col gap-2">
              {group.comments.map((c) => (
                <li
                  key={c.id}
                  className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-2"
                >
                  <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-[hsl(var(--muted-foreground))]">
                    <span className="min-w-0 flex-1 truncate font-semibold text-[hsl(var(--foreground))]">
                      {c.author ?? t("comments.thread.anonAuthor")}
                    </span>
                    <span className="shrink-0">
                      <RelativeTime ms={c.createdAt} />
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-[12px] leading-snug text-[hsl(var(--foreground))]/85">
                    {c.body}
                  </p>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <p className="text-[12px] leading-snug text-[hsl(var(--muted-foreground))]">
              {truncateBody(head.body)}
            </p>
            <div className="flex items-center justify-between gap-2 text-[11px] text-[hsl(var(--muted-foreground))]">
              <span className="min-w-0 flex-1 truncate">
                {head.author ?? t("comments.thread.anonAuthor")}
              </span>
              <span className="flex shrink-0 items-center gap-2">
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
          </>
        )}
        {/* Spacer so the absolutely-positioned Reopen action never overlaps
            the row's text on small thread previews. */}
        {showReopen ? <div className="h-7" aria-hidden="true" /> : null}
      </button>
      {showReopen ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onReopen?.(head);
          }}
          aria-label={t("comments.thread.reopenAria")}
          // Mirror the row's roving-tabindex state so Tab can't land on the
          // Reopen button of an inactive card. When the row is the active
          // treeitem (`tabIndex === 0`), Reopen is reachable as part of the
          // active card's actions; on non-active cards it stays at -1.
          tabIndex={tabIndex === 0 ? 0 : -1}
          className={cn(
            "absolute right-3 bottom-3 inline-flex h-7 items-center gap-1.5 rounded-md",
            "border border-[hsl(var(--border))] bg-[hsl(var(--card))]",
            "px-2.5 text-[11px] font-medium text-[hsl(var(--foreground))]",
            "transition-colors hover:bg-[hsl(var(--accent))]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
          )}
        >
          <RotateCcwIcon className="h-3 w-3" aria-hidden="true" />
          <span>{t("comments.thread.reopen")}</span>
        </button>
      ) : null}
    </div>
  );
});

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

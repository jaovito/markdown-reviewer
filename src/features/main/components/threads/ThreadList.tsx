import type { ReviewComment } from "@/shared/ipc/contract";
import { useSelectedThread } from "@/shared/stores/useSelectedThread";
import { Skeleton } from "@/shared/ui/skeleton";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { scrollToAnchorLine } from "../../lib/scrollToAnchor";
import { ThreadCard, type ThreadGroup } from "./ThreadCard";

interface ThreadListProps {
  comments: ReviewComment[];
  isLoading: boolean;
  hideFilePath: boolean;
  hiddenCount: number;
  /** File path of the currently open preview, when one is selected. */
  currentFilePath?: string;
}

export function ThreadList({
  comments,
  isLoading,
  hideFilePath,
  hiddenCount,
  currentFilePath,
}: ThreadListProps) {
  const { t } = useTranslation();
  const selectedId = useSelectedThread((s) => s.selectedCommentId);
  const select = useSelectedThread((s) => s.select);
  const groups = useMemo(() => groupByAnchor(comments), [comments]);
  const cardRefs = useRef(new Map<string, HTMLButtonElement>());
  // Per-key callback cache so the same group key always yields the same
  // callback ref across renders — avoids React calling the previous ref
  // with `null` and the new one with the node on every render of the list.
  const refSetters = useRef(new Map<string, (node: HTMLButtonElement | null) => void>());
  const setCardRef = useCallback((key: string) => {
    let cb = refSetters.current.get(key);
    if (cb) return cb;
    cb = (node: HTMLButtonElement | null) => {
      if (node) cardRefs.current.set(key, node);
      else cardRefs.current.delete(key);
    };
    refSetters.current.set(key, cb);
    return cb;
  }, []);

  // Prune cached ref-setters and node refs for groups that no longer exist
  // so the maps don't grow unbounded over a long review session.
  useEffect(() => {
    const live = new Set(groups.map((g) => g.key));
    for (const key of refSetters.current.keys()) {
      if (!live.has(key)) refSetters.current.delete(key);
    }
    for (const key of cardRefs.current.keys()) {
      if (!live.has(key)) cardRefs.current.delete(key);
    }
  }, [groups]);

  // When the selection changes (often from clicking an inline marker in the
  // preview), bring the matching card into view so the stacked threads are
  // visible without manual scrolling. Honor `prefers-reduced-motion` so the
  // smooth scroll only kicks in for users who haven't opted out of motion.
  useEffect(() => {
    if (selectedId === null) return;
    const match = groups.find((g) => g.comments.some((c) => c.id === selectedId));
    if (!match) return;
    const node = cardRefs.current.get(match.key);
    if (!node) return;
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    node.scrollIntoView({
      block: "nearest",
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
  }, [selectedId, groups]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <p className="px-1 py-6 text-center text-xs text-[hsl(var(--muted-foreground))]">
        {t("main.threads.empty")}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {groups.map((group) => {
        const isSelected = group.comments.some((c) => c.id === selectedId);
        return (
          <ThreadCard
            key={group.key}
            ref={setCardRef(group.key)}
            group={group}
            selected={isSelected}
            hideFilePath={hideFilePath}
            onSelect={(comment) => {
              select(comment.id);
              // Scrolling targets the *currently open* preview's article;
              // for cross-file threads we'd land on an unrelated same-numbered
              // line. Skip until file navigation is wired.
              if (comment.filePath === currentFilePath) {
                scrollToAnchorLine(getAnchorScrollLine(comment));
              }
            }}
          />
        );
      })}
      {hiddenCount > 0 ? (
        <p className="pt-2 text-center text-[11px] text-[hsl(var(--muted-foreground))]">
          {t("main.threads.hiddenCount", { count: hiddenCount })}
        </p>
      ) : null}
    </div>
  );
}

function getAnchorScrollLine(comment: ReviewComment): number {
  // Inline thread cards / badges mount under `attachLine` (== endLine for
  // ranges; see `groupCommentsByStartLine`). Scrolling to the start line
  // of a long range can leave the actual card off-screen, so target the
  // end line instead.
  const a = comment.anchor;
  if (a.kind === "singleLine") return a.line;
  return a.endLine;
}

function groupByAnchor(comments: ReviewComment[]): ThreadGroup[] {
  const buckets = new Map<string, ThreadGroup>();
  for (const comment of comments) {
    const startLine = startLineOf(comment);
    const endLine = endLineOf(comment);
    // Include the anchor extent in the key so a single-line and a multi-line
    // range that share `startLine` render as distinct cards.
    const key = `${comment.filePath}::${startLine}:${endLine}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.comments.push(comment);
    } else {
      buckets.set(key, {
        key,
        filePath: comment.filePath,
        startLine,
        comments: [comment],
      });
    }
  }
  for (const group of buckets.values()) {
    group.comments.sort((a, b) => a.createdAt - b.createdAt);
  }
  // Sort groups by file path, then by start line — stable, predictable order.
  return Array.from(buckets.values()).sort((a, b) => {
    if (a.filePath !== b.filePath) return a.filePath.localeCompare(b.filePath);
    return a.startLine - b.startLine;
  });
}

function startLineOf(comment: ReviewComment): number {
  const a = comment.anchor;
  if (a.kind === "singleLine") return a.line;
  return a.startLine;
}

function endLineOf(comment: ReviewComment): number {
  const a = comment.anchor;
  if (a.kind === "singleLine") return a.line;
  return a.endLine;
}

import type { ReviewComment } from "@/shared/ipc/contract";
import { useSelectedThread } from "@/shared/stores/useSelectedThread";
import { Skeleton } from "@/shared/ui/skeleton";
import { useMemo } from "react";
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
  const a = comment.anchor;
  if (a.kind === "singleLine") return a.line;
  return a.startLine;
}

function groupByAnchor(comments: ReviewComment[]): ThreadGroup[] {
  const buckets = new Map<string, ThreadGroup>();
  for (const comment of comments) {
    const startLine = startLineOf(comment);
    const key = `${comment.filePath}::${startLine}`;
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
  // Sort groups by file path, then by line number — stable, predictable order.
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

import { usePullRequestComments } from "@/features/comments/hooks/usePullRequestComments";
import type { CommentState, ReviewComment } from "@/shared/ipc/contract";
import { describeError } from "@/shared/ipc/errors";
import { cn } from "@/shared/lib/cn";
import { Alert, AlertDescription, AlertTitle } from "@/shared/ui/alert";
import { ScrollArea } from "@/shared/ui/scroll-area";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { type FilterableState, ThreadFilterBar } from "./threads/ThreadFilterBar";
import { ThreadList } from "./threads/ThreadList";

interface ThreadsPaneProps {
  prNumber?: number;
  filePath?: string;
}

const DEFAULT_FILTER: Record<FilterableState, boolean> = {
  draft: true,
  submitted: true,
  resolved: false,
  hidden: false,
};

type Scope = "currentFile" | "allFiles";

export function ThreadsPane({ prNumber, filePath }: ThreadsPaneProps) {
  const { t } = useTranslation();
  const query = usePullRequestComments(prNumber);
  const [filter, setFilter] = useState<Record<FilterableState, boolean>>(DEFAULT_FILTER);
  const [scope, setScope] = useState<Scope>("currentFile");

  const allComments = query.data ?? [];

  // When no file is selected, force the "all files" view so the user still sees
  // every PR-level thread instead of an empty pane.
  const effectiveScope: Scope = filePath ? scope : "allFiles";

  const scopedComments = useMemo(() => {
    if (effectiveScope === "currentFile" && filePath) {
      return allComments.filter((c) => c.filePath === filePath);
    }
    return allComments;
  }, [allComments, effectiveScope, filePath]);

  const { visible, hiddenCount } = useMemo(
    () => partitionByFilter(scopedComments, filter),
    [scopedComments, filter],
  );

  return (
    <aside className="flex h-full w-[336px] shrink-0 flex-col border-l border-[hsl(var(--border))] bg-[hsl(var(--muted))]">
      <header className="flex flex-col gap-3 px-4 pb-3 pt-4">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-[hsl(var(--foreground))]">
            {t("main.threads.title")}
          </span>
          <span className="text-xs text-[hsl(var(--muted-foreground))]">
            {t("main.threads.subtitle")}
          </span>
        </div>
        {filePath ? (
          <ScopeToggle
            value={effectiveScope}
            onChange={setScope}
            currentLabel={t("main.threads.currentFile")}
            allLabel={t("main.threads.allFiles")}
          />
        ) : null}
        <ThreadFilterBar
          enabled={filter}
          onToggle={(s) => setFilter((prev) => ({ ...prev, [s]: !prev[s] }))}
        />
      </header>
      <ScrollArea className="flex-1">
        <div className="px-3 pb-4 pt-1">
          {query.isError && query.error ? (
            <Alert tone="destructive">
              <div className="min-w-0 flex-1">
                <AlertTitle>{t("main.threads.errorTitle")}</AlertTitle>
                <AlertDescription>{describeError(query.error).description}</AlertDescription>
              </div>
            </Alert>
          ) : prNumber === undefined ? (
            <p className="px-1 py-6 text-center text-xs text-[hsl(var(--muted-foreground))]">
              {t("main.threads.empty")}
            </p>
          ) : (
            <ThreadList
              comments={visible}
              isLoading={query.isLoading}
              hideFilePath={effectiveScope === "currentFile"}
              hiddenCount={hiddenCount}
              currentFilePath={filePath}
            />
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}

function ScopeToggle({
  value,
  onChange,
  currentLabel,
  allLabel,
}: {
  value: Scope;
  onChange: (s: Scope) => void;
  currentLabel: string;
  allLabel: string;
}) {
  return (
    <div className="inline-flex w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-0.5 text-[12px]">
      <ScopeButton active={value === "currentFile"} onClick={() => onChange("currentFile")}>
        {currentLabel}
      </ScopeButton>
      <ScopeButton active={value === "allFiles"} onClick={() => onChange("allFiles")}>
        {allLabel}
      </ScopeButton>
    </div>
  );
}

function ScopeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 rounded-[4px] px-2 py-1.5 font-medium transition-colors",
        active
          ? "bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] shadow-xs"
          : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]",
      )}
    >
      {children}
    </button>
  );
}

function partitionByFilter(
  comments: ReviewComment[],
  filter: Record<FilterableState, boolean>,
): { visible: ReviewComment[]; hiddenCount: number } {
  const visible: ReviewComment[] = [];
  let hiddenCount = 0;
  for (const comment of comments) {
    if (comment.state === "deleted") {
      // Deleted threads stay traceable as part of the "hidden" tally without
      // showing the body — we never render them in the list.
      hiddenCount += 1;
      continue;
    }
    const allowed = filter[comment.state as FilterableState];
    if (allowed) {
      visible.push(comment);
    } else {
      hiddenCount += 1;
    }
  }
  return { visible, hiddenCount };
}

// Internal re-export so the filter type stays alongside the pane.
export type { CommentState };

import { usePullRequestComments } from "@/features/comments/hooks/usePullRequestComments";
import { ipc } from "@/shared/ipc/client";
import type { CommentState, ReviewComment } from "@/shared/ipc/contract";
import { describeError } from "@/shared/ipc/errors";
import { cn } from "@/shared/lib/cn";
import { useThreadsFilter } from "@/shared/stores/useThreadsFilter";
import { Alert, AlertDescription, AlertTitle } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
import { ScrollArea } from "@/shared/ui/scroll-area";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { type FilterableState, ThreadFilterBar } from "./threads/ThreadFilterBar";
import { ThreadList } from "./threads/ThreadList";

interface ThreadsPaneProps {
  prNumber?: number;
  filePath?: string;
}

type Scope = "currentFile" | "allFiles";

export function ThreadsPane({ prNumber, filePath }: ThreadsPaneProps) {
  const { t } = useTranslation();
  const query = usePullRequestComments(prNumber);
  const filter = useThreadsFilter((s) => s.filter);
  const toggleFilter = useThreadsFilter((s) => s.toggle);
  const ensureFilterVisible = useThreadsFilter((s) => s.ensureVisible);
  const [scope, setScope] = useState<Scope>("currentFile");
  const queryClient = useQueryClient();

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

  // "Hide all" applies to the threads currently surfaced in the pane (under
  // the active scope + filter). Comments already `hidden`, `resolved`, or
  // `deleted` are skipped — only `draft`/`submitted` are valid sources for
  // the `Submitted → Hidden` transition that the Rust store allows.
  const hideAll = useMutation({
    mutationFn: async (ids: number[]) => {
      const results = await Promise.all(
        ids.map((id) => ipc.comments.update(id, { state: "hidden" })),
      );
      const failure = results.find((r) => !r.ok);
      if (failure && !failure.ok) throw failure.error;
      return results.length;
    },
    onSuccess: () => {
      if (prNumber !== undefined) {
        queryClient.invalidateQueries({ queryKey: ["local-comments", prNumber] });
        if (filePath) {
          queryClient.invalidateQueries({ queryKey: ["local-comments", prNumber, filePath] });
        }
      }
    },
  });

  const hideableIds = useMemo(
    () => visible.filter((c) => c.state === "draft" || c.state === "submitted").map((c) => c.id),
    [visible],
  );

  const canHideAll = !hideAll.isPending && hideableIds.length > 0;

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
        <ThreadFilterBar enabled={filter} onToggle={toggleFilter} />
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canHideAll}
            onClick={() => hideAll.mutate(hideableIds)}
            aria-label={t("main.threads.hideAllAria", { count: hideableIds.length })}
            className="h-7 flex-1 gap-1.5 px-2.5 text-[12px] font-medium"
          >
            <EyeOffIcon className="h-3 w-3" aria-hidden="true" />
            <span>{t("main.threads.hideAll")}</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => ensureFilterVisible("hidden")}
            aria-pressed={filter.hidden}
            aria-label={t("main.threads.showHiddenAria")}
            className={cn(
              "h-7 flex-1 gap-1.5 px-2.5 text-[12px] font-medium",
              filter.hidden
                ? "border-[hsl(var(--foreground))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))]"
                : null,
            )}
          >
            <EyeIcon className="h-3 w-3" aria-hidden="true" />
            <span>{t("main.threads.showHidden")}</span>
          </Button>
        </div>
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

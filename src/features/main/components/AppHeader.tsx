import { usePullRequestComments } from "@/features/comments/hooks/usePullRequestComments";
import { useRepoPath } from "@/features/pull-requests/hooks/useRepoPath";
import { useRemoteThreads } from "@/features/sync";
import { ipc } from "@/shared/ipc/client";
import type { AppError, PullRequestDetail } from "@/shared/ipc/contract";
import { describeError } from "@/shared/ipc/errors";
import { Button } from "@/shared/ui/button";
import { Separator } from "@/shared/ui/separator";
import { Skeleton } from "@/shared/ui/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, GitBranchIcon } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { usePullRequestTitle } from "../hooks/usePullRequestTitle";
import { RefreshButton } from "./RefreshButton";

interface AppHeaderProps {
  owner: string;
  repo: string;
  prNumber?: number;
  branch?: string | null;
  rightAction?: React.ReactNode;
}

export function AppHeader({ owner, repo, prNumber, branch, rightAction }: AppHeaderProps) {
  const { t } = useTranslation();
  const title = usePullRequestTitle(owner, repo, prNumber);

  const repoPath = useRepoPath(owner, repo).data ?? undefined;

  const prDetail = useQuery<PullRequestDetail, AppError>({
    queryKey: ["pull-request", repoPath, prNumber],
    enabled: Boolean(repoPath && prNumber),
    queryFn: async () => {
      const res = await ipc.pullRequests.load(repoPath as string, prNumber as number);
      if (!res.ok) throw res.error;
      return res.value;
    },
  });
  const headSha = prDetail.data?.headSha;

  const remote = useRemoteThreads({ repoPath, prNumber, headSha });

  const comments = usePullRequestComments(prNumber);
  const draftIds = useMemo(
    () => (comments.data ?? []).filter((c) => c.state === "draft").map((c) => c.id),
    [comments.data],
  );

  const queryClient = useQueryClient();
  const submit = useMutation({
    mutationFn: async () => {
      if (!repoPath || prNumber === undefined) {
        throw new Error("missing repoPath or prNumber");
      }
      const res = await ipc.comments.submitReview(repoPath, prNumber, draftIds);
      if (!res.ok) throw res.error;
      return res.value;
    },
    onSettled: () => {
      if (prNumber !== undefined) {
        queryClient.invalidateQueries({ queryKey: ["local-comments", prNumber] });
      }
    },
    onSuccess: (result) => {
      const submitted = result.comments.filter((c) => c.submitted).length;
      const failed = result.comments.length - submitted;
      const total = result.comments.length;
      if (failed === 0) {
        window.alert(t("app.finishReview.success", { count: submitted, total }));
      } else if (submitted === 0) {
        const first = result.comments.find((c) => c.error)?.error ?? "";
        window.alert(t("app.finishReview.allFailed", { total, error: first }));
      } else {
        window.alert(t("app.finishReview.partial", { submitted, total, failed }));
      }
    },
    onError: (error) => {
      const description = describeError(error as unknown as AppError).description;
      window.alert(`${t("app.finishReview.failedTitle")}\n\n${description}`);
    },
  });

  const canFinish =
    Boolean(repoPath) && prNumber !== undefined && draftIds.length > 0 && !submit.isPending;

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] px-5">
      <div className="flex shrink-0 items-center gap-2.5">
        <div className="flex size-7 items-center justify-center rounded-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]">
          <span className="text-[11px] font-bold">M</span>
        </div>
        <span className="text-sm font-semibold tracking-tight">{t("app.brand")}</span>
      </div>
      <Separator orientation="vertical" className="h-5" />
      <span className="shrink-0 text-xs text-[hsl(var(--muted-foreground))]">
        {owner}/<span className="text-[hsl(var(--foreground))]">{repo}</span>
      </span>
      {prNumber ? (
        <>
          <span className="shrink-0 text-xs text-[hsl(var(--muted-foreground))]">/</span>
          <span className="shrink-0 text-xs font-medium">PR #{prNumber}</span>
          <PullRequestTitle data={title.data} isLoading={title.isLoading} />
        </>
      ) : null}
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {rightAction}
        <RefreshButton onRefresh={remote.refresh} />
        {branch ? (
          <span className="flex h-8 items-center gap-1.5 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/40 px-2.5 text-xs">
            <GitBranchIcon className="size-3.5 text-[hsl(var(--muted-foreground))]" />
            {branch}
          </span>
        ) : null}
        {prNumber ? (
          <Button
            size="sm"
            className="gap-1.5"
            disabled={!canFinish}
            onClick={() => submit.mutate()}
            title={
              draftIds.length === 0
                ? t("app.finishReview.noDraftsTooltip")
                : t("app.finishReview.tooltip", { count: draftIds.length })
            }
          >
            <CheckIcon className="size-3.5" />
            {t("app.actions.finishReview")}
            {draftIds.length > 0 ? (
              <span className="ml-1 rounded-full bg-[hsl(var(--primary-foreground))]/20 px-1.5 text-[10px]">
                {draftIds.length}
              </span>
            ) : null}
          </Button>
        ) : null}
      </div>
    </header>
  );
}

function PullRequestTitle({ data, isLoading }: { data: string | undefined; isLoading: boolean }) {
  if (isLoading) {
    return <Skeleton className="ml-1 h-3.5 w-40" />;
  }
  if (!data) return null;
  return (
    <span
      className="ml-1 min-w-0 truncate text-xs text-[hsl(var(--muted-foreground))]"
      title={data}
    >
      {data}
    </span>
  );
}

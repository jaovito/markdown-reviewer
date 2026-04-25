import { useRepoContext } from "@/features/main";
import { useDebouncedValue } from "@/shared/hooks/useDebouncedValue";
import { describeError } from "@/shared/ipc/errors";
import { Alert, AlertDescription, AlertTitle } from "@/shared/ui/alert";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { PullRequestRow } from "../../components/PullRequestRow";
import { PullRequestSearch } from "../../components/PullRequestSearch";
import { usePullRequests } from "../../hooks/usePullRequests";
import { useRepoPath } from "../../hooks/useRepoPath";
import { filterPullRequests } from "../../lib/filterPullRequests";
import { EmptyState } from "./EmptyState";
import { SkeletonList } from "./SkeletonList";

export function PullRequestListScreen() {
  const { t } = useTranslation();
  const { owner, repo } = useRepoContext();
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query);
  const repoPath = useRepoPath(owner, repo);
  const prs = usePullRequests(repoPath.data ?? undefined);

  const filtered = useMemo(() => {
    if (!prs.data) return [];
    return filterPullRequests(prs.data, debouncedQuery);
  }, [prs.data, debouncedQuery]);

  const repoPathMissing = !repoPath.isLoading && repoPath.data === null;
  const isLoadingPrs = repoPath.isLoading || (Boolean(repoPath.data) && prs.isLoading);

  return (
    <main className="mx-auto flex h-full w-full max-w-3xl flex-col gap-4 overflow-auto px-6 py-8">
      <header className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold tracking-tight">{t("pullRequests.list.heading")}</h2>
        <span className="text-xs text-[hsl(var(--muted-foreground))]">
          {prs.data
            ? t("pullRequests.list.count", { shown: filtered.length, total: prs.data.length })
            : null}
        </span>
      </header>

      <PullRequestSearch value={query} onChange={setQuery} />

      {repoPath.error ? (
        <Alert tone="destructive">
          <AlertTitle>{describeError(repoPath.error).title}</AlertTitle>
          <AlertDescription>{describeError(repoPath.error).description}</AlertDescription>
        </Alert>
      ) : repoPathMissing ? (
        <Alert tone="destructive">
          <AlertTitle>{t("pullRequests.list.repoMissingTitle")}</AlertTitle>
          <AlertDescription>
            {t("pullRequests.list.repoMissingDescription", { owner, repo })}
          </AlertDescription>
        </Alert>
      ) : null}

      {prs.error ? (
        <Alert tone="destructive">
          <AlertTitle>{describeError(prs.error).title}</AlertTitle>
          <AlertDescription>{describeError(prs.error).description}</AlertDescription>
          {describeError(prs.error).actionHint ? (
            <AlertDescription className="mt-1 text-xs">
              {describeError(prs.error).actionHint}
            </AlertDescription>
          ) : null}
        </Alert>
      ) : null}

      <ul className="flex flex-col gap-1">
        {isLoadingPrs ? (
          <SkeletonList />
        ) : filtered.length === 0 && prs.data ? (
          <EmptyState hasQuery={query.length > 0} />
        ) : (
          filtered.map((pr) => (
            <li key={pr.number}>
              <PullRequestRow owner={owner} repo={repo} pr={pr} />
            </li>
          ))
        )}
      </ul>
    </main>
  );
}

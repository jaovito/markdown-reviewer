import { useRepoContext } from "@/features/main";
import { useDebouncedValue } from "@/shared/hooks/useDebouncedValue";
import type { PullRequestSummary } from "@/shared/ipc/contract";
import { describeError } from "@/shared/ipc/errors";
import { Alert, AlertDescription, AlertTitle } from "@/shared/ui/alert";
import { Skeleton } from "@/shared/ui/skeleton";
import { useMemo, useState } from "react";
import { PullRequestRow } from "../components/PullRequestRow";
import { PullRequestSearch } from "../components/PullRequestSearch";
import { usePullRequests } from "../hooks/usePullRequests";
import { useRepoPath } from "../hooks/useRepoPath";

export function PullRequestListPage() {
  const { owner, repo } = useRepoContext();
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query);
  const repoPath = useRepoPath(owner, repo);
  const prs = usePullRequests(repoPath.data ?? undefined);

  const filtered = useMemo(() => {
    if (!prs.data) return [];
    return filterPullRequests(prs.data, debouncedQuery);
  }, [prs.data, debouncedQuery]);

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col gap-4 px-6 py-6">
      <header className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Open pull requests</h2>
        <span className="text-xs text-[hsl(var(--muted-foreground))]">
          {prs.data ? `${filtered.length} of ${prs.data.length}` : null}
        </span>
      </header>

      <PullRequestSearch value={query} onChange={setQuery} />

      {repoPath.data === null && !repoPath.isLoading ? (
        <Alert tone="destructive">
          <AlertTitle>Repository not in recents</AlertTitle>
          <AlertDescription>
            We couldn't find a local path for {owner}/{repo}. Pick the folder again from the home
            screen.
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
        {prs.isLoading ? (
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
    </div>
  );
}

const SKELETON_KEYS = ["s-1", "s-2", "s-3", "s-4"] as const;

function SkeletonList() {
  return (
    <>
      {SKELETON_KEYS.map((k) => (
        <li key={k} className="px-3 py-3">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="mt-2 h-3 w-1/2" />
        </li>
      ))}
    </>
  );
}

function EmptyState({ hasQuery }: { hasQuery: boolean }) {
  return (
    <li className="rounded-md border border-dashed border-[hsl(var(--border))] px-4 py-10 text-center text-sm text-[hsl(var(--muted-foreground))]">
      {hasQuery
        ? "No pull requests match your search."
        : "There are no open pull requests for this repository."}
    </li>
  );
}

export function filterPullRequests(prs: PullRequestSummary[], query: string): PullRequestSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return prs;
  return prs.filter((pr) => {
    if (`#${pr.number}`.includes(q)) return true;
    return [pr.title, pr.author, pr.baseRef, pr.headRef].some((s) => s.toLowerCase().includes(q));
  });
}

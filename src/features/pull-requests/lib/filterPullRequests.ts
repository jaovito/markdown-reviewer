import type { PullRequestSummary } from "@/shared/ipc/contract";

/**
 * Case-insensitive search across title, number (with or without `#`), author,
 * and base/head branch names. Empty query keeps the list as-is.
 */
export function filterPullRequests(prs: PullRequestSummary[], query: string): PullRequestSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return prs;
  return prs.filter((pr) => {
    if (`#${pr.number}`.includes(q)) return true;
    return [pr.title, pr.author, pr.baseRef, pr.headRef].some((s) => s.toLowerCase().includes(q));
  });
}

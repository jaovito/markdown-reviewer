import { create } from "zustand";
import { persist } from "zustand/middleware";

interface LastPullRequestState {
  /** Map keyed by `${owner}/${repo}` → last PR number opened on that repo. */
  byRepo: Record<string, number>;
  remember: (owner: string, repo: string, prNumber: number) => void;
  recall: (owner: string, repo: string) => number | undefined;
  forget: (owner: string, repo: string) => void;
}

const STORAGE_KEY = "markdown-reviewer:last-pr";

function repoKey(owner: string, repo: string): string {
  return `${owner}/${repo}`;
}

export const useLastPullRequest = create<LastPullRequestState>()(
  persist(
    (set, get) => ({
      byRepo: {},
      remember: (owner, repo, prNumber) =>
        set((s) => ({ byRepo: { ...s.byRepo, [repoKey(owner, repo)]: prNumber } })),
      recall: (owner, repo) => get().byRepo[repoKey(owner, repo)],
      forget: (owner, repo) =>
        set((s) => {
          const next = { ...s.byRepo };
          delete next[repoKey(owner, repo)];
          return { byRepo: next };
        }),
    }),
    { name: STORAGE_KEY },
  ),
);

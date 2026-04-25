import { useOutletContext } from "react-router-dom";

export interface RepoContext {
  owner: string;
  repo: string;
}

/** Reads the `{ owner, repo }` pair injected by `MainLayout` into the outlet. */
export function useRepoContext() {
  return useOutletContext<RepoContext>();
}

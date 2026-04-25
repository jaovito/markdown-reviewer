import { Outlet, useLocation, useOutletContext, useParams } from "react-router-dom";
import { AppHeader } from "../components/AppHeader";
import { Rail } from "../components/Rail";

interface RepoCtx {
  owner: string;
  repo: string;
}

export function MainLayout() {
  const params = useParams<{ owner: string; repo: string }>();
  const owner = params.owner ?? "";
  const repo = params.repo ?? "";
  const location = useLocation();
  const prMatch = location.pathname.match(/\/pulls\/(\d+)/);
  const prNumber = prMatch ? Number(prMatch[1]) : undefined;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <AppHeader owner={owner} repo={repo} prNumber={prNumber} />
      <div className="flex min-h-0 flex-1">
        <Rail />
        <Outlet context={{ owner, repo } satisfies RepoCtx} />
      </div>
    </div>
  );
}

export function useRepoContext() {
  return useOutletContext<RepoCtx>();
}

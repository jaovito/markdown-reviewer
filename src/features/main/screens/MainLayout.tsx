import { Outlet, useLocation, useParams } from "react-router-dom";
import { AppHeader } from "../components/AppHeader";
import { Rail } from "../components/Rail";
import type { RepoContext } from "../hooks/useRepoContext";

interface RepoRouteState {
  branch?: string | null;
}

export function MainLayout() {
  const params = useParams<{ owner: string; repo: string }>();
  const owner = params.owner ?? "";
  const repo = params.repo ?? "";
  const location = useLocation();
  const routeState = location.state as RepoRouteState | null;
  const prMatch = location.pathname.match(/\/pulls\/(\d+)/);
  const prNumber = prMatch ? Number(prMatch[1]) : undefined;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <AppHeader owner={owner} repo={repo} prNumber={prNumber} branch={routeState?.branch} />
      <div className="flex min-h-0 flex-1">
        <Rail />
        <Outlet context={{ owner, repo } satisfies RepoContext} />
      </div>
    </div>
  );
}

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/shared/ui/resizable";
import type { ReactNode } from "react";
import { Outlet, useOutletContext, useParams } from "react-router-dom";
import { PreviewSlot } from "../components/PreviewSlot";
import { Rail } from "../components/Rail";
import { ThreadsPane } from "../components/ThreadsPane";
import { Toolbar } from "../components/Toolbar";

interface RepoCtx {
  owner: string;
  repo: string;
}

export function MainLayout() {
  const params = useParams<{ owner: string; repo: string }>();
  const owner = params.owner ?? "";
  const repo = params.repo ?? "";

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <Rail />
      <div className="flex min-w-0 flex-1 flex-col">
        <Toolbar owner={owner} repo={repo} />
        <div className="min-h-0 flex-1">
          <Outlet context={{ owner, repo } satisfies RepoCtx} />
        </div>
      </div>
    </div>
  );
}

export function useRepoContext() {
  return useOutletContext<RepoCtx>();
}

interface MainShellProps {
  sidebar: ReactNode;
  preview?: ReactNode;
  previewEmptyHint?: string;
  threads?: ReactNode;
}

/**
 * Three-panel content area used by every screen inside `MainLayout`.
 * Each route owns its own sidebar/preview/threads content and composes them
 * here, so the resizable layout stays consistent across routes.
 */
export function MainShell({ sidebar, preview, previewEmptyHint, threads }: MainShellProps) {
  return (
    <ResizablePanelGroup orientation="horizontal" className="h-full">
      <ResizablePanel defaultSize={22} minSize={15} maxSize={35}>
        {sidebar}
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={56} minSize={30}>
        <PreviewSlot emptyHint={previewEmptyHint}>{preview}</PreviewSlot>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={22} minSize={15} maxSize={40}>
        {threads ?? <ThreadsPane />}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

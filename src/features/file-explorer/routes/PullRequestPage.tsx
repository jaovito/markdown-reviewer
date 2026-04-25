import { isMarkdownPath } from "@/features/file-explorer";
import { PreviewSlot, SidebarShell, ThreadsPane, useRepoContext } from "@/features/main";
import {
  MarkdownPreview,
  UnsupportedFile,
  useFileContent,
  useFileDiff,
  usePullRequestDetail,
} from "@/features/markdown-preview";
import { useRepoPath } from "@/features/pull-requests";
import { useDebouncedValue } from "@/shared/hooks/useDebouncedValue";
import { describeError } from "@/shared/ipc/errors";
import { Alert, AlertDescription, AlertTitle } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
import { Skeleton } from "@/shared/ui/skeleton";
import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { FileTree } from "../components/FileTree";
import { FileTreeSearch } from "../components/FileTreeSearch";
import { useChangedFiles } from "../hooks/useChangedFiles";
import { filterChangedFiles } from "../lib/filterFiles";

export function PullRequestPage() {
  const { owner, repo } = useRepoContext();
  const params = useParams<{ number: string; "*": string }>();
  const prNumber = Number(params.number);
  const selectedPath = params["*"] ? decodePath(params["*"]) : undefined;

  const [filterQuery, setFilterQuery] = useState("");
  const debouncedFilter = useDebouncedValue(filterQuery);

  const repoPath = useRepoPath(owner, repo);
  const files = useChangedFiles(repoPath.data ?? undefined, prNumber);
  const detail = usePullRequestDetail(repoPath.data ?? undefined, prNumber);

  const filteredFiles = useMemo(
    () => filterChangedFiles(files.data ?? [], debouncedFilter),
    [files.data, debouncedFilter],
  );

  const basePath = `/repo/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${prNumber}`;

  return (
    <>
      <SidebarShell
        title="Changes"
        subtitle={
          files.data
            ? `${filteredFiles.length} of ${files.data.length} files`
            : `Files in PR #${prNumber}`
        }
        toolbar={<FileTreeSearch value={filterQuery} onChange={setFilterQuery} />}
      >
        {files.isLoading ? (
          <SidebarSkeleton />
        ) : files.error ? (
          <Alert tone="destructive" className="mx-2 mt-2">
            <AlertTitle>{describeError(files.error).title}</AlertTitle>
            <AlertDescription>{describeError(files.error).description}</AlertDescription>
          </Alert>
        ) : filteredFiles.length === 0 && (files.data?.length ?? 0) > 0 ? (
          <p className="px-2 py-6 text-xs text-[hsl(var(--muted-foreground))]">
            No files match "{debouncedFilter}".
          </p>
        ) : (
          <FileTree files={filteredFiles} selectedPath={selectedPath} basePath={basePath} />
        )}
      </SidebarShell>
      <PreviewSlot
        toolbar={
          <span className="text-xs text-[hsl(var(--muted-foreground))]">
            {selectedPath ?? `Pull request #${prNumber}`}
          </span>
        }
        emptyHint="Pick a Markdown file from the sidebar to start reading."
      >
        {selectedPath ? (
          <PreviewArea
            repoPath={repoPath.data ?? undefined}
            sha={detail.data?.headSha}
            filePath={selectedPath}
            isDetailLoading={detail.isLoading}
            prNumber={prNumber}
          />
        ) : null}
      </PreviewSlot>
      <ThreadsPane />
    </>
  );
}

interface PreviewAreaProps {
  repoPath: string | undefined;
  sha: string | undefined;
  filePath: string;
  isDetailLoading: boolean;
  prNumber: number;
}

function PreviewArea({ repoPath, sha, filePath, isDetailLoading, prNumber }: PreviewAreaProps) {
  const supported = isMarkdownPath(filePath);
  const file = useFileContent({
    repoPath,
    sha,
    filePath: supported ? filePath : undefined,
  });
  const diff = useFileDiff({
    repoPath,
    prNumber,
    filePath: supported ? filePath : undefined,
  });

  if (!supported) {
    return <UnsupportedFile path={filePath} />;
  }
  if (isDetailLoading || file.isLoading) {
    return <PreviewSkeleton />;
  }
  if (file.error) {
    const view = describeError(file.error);
    return (
      <div className="mx-auto max-w-2xl px-6 py-8">
        <Alert tone="destructive">
          <AlertTitle>{view.title}</AlertTitle>
          <AlertDescription>{view.description}</AlertDescription>
          {view.actionHint ? (
            <AlertDescription className="mt-1 text-xs">{view.actionHint}</AlertDescription>
          ) : null}
        </Alert>
        <Button onClick={() => file.refetch()} size="sm" variant="outline" className="mt-3">
          Retry
        </Button>
      </div>
    );
  }
  return <MarkdownPreview source={file.data ?? ""} hunks={diff.data?.hunks} />;
}

function PreviewSkeleton() {
  const keys = ["s-1", "s-2", "s-3", "s-4", "s-5"];
  return (
    <div className="mx-auto w-full max-w-3xl space-y-3 px-8 py-8">
      <Skeleton className="h-8 w-2/3" />
      {keys.map((k) => (
        <Skeleton key={k} className="h-4 w-full" />
      ))}
      <Skeleton className="h-4 w-3/4" />
    </div>
  );
}

function SidebarSkeleton() {
  const keys = ["a", "b", "c", "d", "e"];
  return (
    <ul className="space-y-2 px-2 py-2">
      {keys.map((k) => (
        <li key={k}>
          <Skeleton className="h-4 w-full" />
        </li>
      ))}
    </ul>
  );
}

function decodePath(raw: string): string {
  return raw.split("/").map(decodeURIComponent).join("/");
}

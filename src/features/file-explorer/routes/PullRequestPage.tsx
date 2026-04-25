import { isMarkdownPath } from "@/features/file-explorer";
import { MainShell, SidebarShell, useRepoContext } from "@/features/main";
import {
  MarkdownPreview,
  UnsupportedFile,
  useFileContent,
  usePullRequestDetail,
} from "@/features/markdown-preview";
import { useRepoPath } from "@/features/pull-requests";
import { describeError } from "@/shared/ipc/errors";
import { Alert, AlertDescription, AlertTitle } from "@/shared/ui/alert";
import { Skeleton } from "@/shared/ui/skeleton";
import { useParams } from "react-router-dom";
import { FileTree } from "../components/FileTree";
import { useChangedFiles } from "../hooks/useChangedFiles";

export function PullRequestPage() {
  const { owner, repo } = useRepoContext();
  const params = useParams<{ number: string; "*": string }>();
  const prNumber = Number(params.number);
  const selectedPath = params["*"] ? decodePath(params["*"]) : undefined;

  const repoPath = useRepoPath(owner, repo);
  const files = useChangedFiles(repoPath.data ?? undefined, prNumber);
  const detail = usePullRequestDetail(repoPath.data ?? undefined, prNumber);

  const basePath = `/repo/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${prNumber}`;

  return (
    <MainShell
      sidebar={
        <SidebarShell title={`Files in #${prNumber}`}>
          {files.isLoading ? (
            <SidebarSkeleton />
          ) : files.error ? (
            <Alert tone="destructive" className="mx-2 mt-2">
              <AlertTitle>{describeError(files.error).title}</AlertTitle>
              <AlertDescription>{describeError(files.error).description}</AlertDescription>
            </Alert>
          ) : (
            <FileTree files={files.data ?? []} selectedPath={selectedPath} basePath={basePath} />
          )}
        </SidebarShell>
      }
      preview={
        selectedPath ? (
          <PreviewArea
            repoPath={repoPath.data ?? undefined}
            sha={detail.data?.headSha}
            filePath={selectedPath}
            isDetailLoading={detail.isLoading}
          />
        ) : undefined
      }
      previewEmptyHint="Pick a Markdown file from the sidebar to start reading."
    />
  );
}

interface PreviewAreaProps {
  repoPath: string | undefined;
  sha: string | undefined;
  filePath: string;
  isDetailLoading: boolean;
}

function PreviewArea({ repoPath, sha, filePath, isDetailLoading }: PreviewAreaProps) {
  if (!isMarkdownPath(filePath)) {
    return <UnsupportedFile path={filePath} />;
  }
  const file = useFileContent({ repoPath, sha, filePath });
  if (isDetailLoading || file.isLoading) {
    return <PreviewSkeleton />;
  }
  if (file.error) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-8">
        <Alert tone="destructive">
          <AlertTitle>{describeError(file.error).title}</AlertTitle>
          <AlertDescription>{describeError(file.error).description}</AlertDescription>
          {describeError(file.error).actionHint ? (
            <AlertDescription className="mt-1 text-xs">
              {describeError(file.error).actionHint}
            </AlertDescription>
          ) : null}
        </Alert>
      </div>
    );
  }
  return <MarkdownPreview source={file.data ?? ""} />;
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

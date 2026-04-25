import { MainShell, SidebarShell, useRepoContext } from "@/features/main";
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
      previewEmptyHint={
        selectedPath
          ? `Preview for ${selectedPath} lands once issue #11 is wired up.`
          : "Pick a Markdown file from the sidebar to start reading."
      }
    />
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

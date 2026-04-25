import type { AppError, ChangedFile } from "@/shared/ipc/contract";
import { describeError } from "@/shared/ipc/errors";
import { Alert, AlertDescription, AlertTitle } from "@/shared/ui/alert";
import { useTranslation } from "react-i18next";
import { FileTree } from "../../components/FileTree";
import { SidebarSkeleton } from "./skeleton";

interface PullRequestSidebarProps {
  owner: string;
  repo: string;
  selectedPath: string | undefined;
  basePath: string;
  debouncedFilter: string;
  filteredFiles: ChangedFile[];
  markdownFileCount: number;
  totalFileCount: number;
  repoPathError: AppError | null;
  isRepoPathMissing: boolean;
  isLoading: boolean;
  filesError: AppError | null;
}

export function PullRequestSidebar({
  owner,
  repo,
  selectedPath,
  basePath,
  debouncedFilter,
  filteredFiles,
  markdownFileCount,
  totalFileCount,
  repoPathError,
  isRepoPathMissing,
  isLoading,
  filesError,
}: PullRequestSidebarProps) {
  const { t } = useTranslation();

  if (repoPathError) {
    return <SidebarError error={repoPathError} />;
  }

  if (isRepoPathMissing) {
    return (
      <Alert tone="destructive" className="mx-2 mt-2">
        <AlertTitle>{t("pullRequests.list.repoMissingTitle")}</AlertTitle>
        <AlertDescription>
          {t("pullRequests.list.repoMissingDescription", { owner, repo })}
        </AlertDescription>
      </Alert>
    );
  }

  if (isLoading) {
    return <SidebarSkeleton />;
  }

  if (filesError) {
    return <SidebarError error={filesError} />;
  }

  if (markdownFileCount === 0 && totalFileCount > 0) {
    return (
      <p className="px-3 py-6 text-xs text-[hsl(var(--muted-foreground))]">
        {t("fileExplorer.sidebar.emptyAllNonMarkdown", { count: totalFileCount })}
      </p>
    );
  }

  if (filteredFiles.length === 0 && markdownFileCount > 0) {
    return (
      <p className="px-2 py-6 text-xs text-[hsl(var(--muted-foreground))]">
        {t("fileExplorer.sidebar.emptyFilter", { query: debouncedFilter })}
      </p>
    );
  }

  return <FileTree files={filteredFiles} selectedPath={selectedPath} basePath={basePath} />;
}

function SidebarError({ error }: { error: AppError }) {
  const view = describeError(error);

  return (
    <Alert tone="destructive" className="mx-2 mt-2">
      <AlertTitle>{view.title}</AlertTitle>
      <AlertDescription>{view.description}</AlertDescription>
    </Alert>
  );
}

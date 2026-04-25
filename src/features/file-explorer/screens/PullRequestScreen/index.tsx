import { PreviewSlot, SidebarShell, ThreadsPane, useRepoContext } from "@/features/main";
import { usePullRequestDetail } from "@/features/markdown-preview";
import { useRepoPath } from "@/features/pull-requests";
import { useDebouncedValue } from "@/shared/hooks/useDebouncedValue";
import { useLastPullRequest } from "@/shared/stores/useLastPullRequest";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { FileTreeSearch } from "../../components/FileTreeSearch";
import { useChangedFiles } from "../../hooks/useChangedFiles";
import { isMarkdownPath } from "../../lib/buildTree";
import { filterChangedFiles } from "../../lib/filterFiles";
import { InvalidPullRequestAlert } from "./InvalidPullRequestAlert";
import { PreviewArea } from "./PreviewArea";
import { PullRequestSidebar } from "./PullRequestSidebar";

export function PullRequestScreen() {
  const { t } = useTranslation();
  const { owner, repo } = useRepoContext();
  const params = useParams<{ number: string; "*": string }>();
  const rawNumber = params.number ?? "";
  const parsedNumber = Number(rawNumber);
  const isValidPrNumber = Number.isFinite(parsedNumber) && parsedNumber > 0;
  const prNumber = isValidPrNumber ? parsedNumber : undefined;
  const selectedPath = params["*"] ? decodePath(params["*"]) : undefined;

  const rememberLastPr = useLastPullRequest((s) => s.remember);
  useEffect(() => {
    if (prNumber !== undefined) rememberLastPr(owner, repo, prNumber);
  }, [owner, repo, prNumber, rememberLastPr]);

  const [filterQuery, setFilterQuery] = useState("");
  const debouncedFilter = useDebouncedValue(filterQuery);

  const repoPath = useRepoPath(owner, repo);
  const files = useChangedFiles(repoPath.data ?? undefined, prNumber);
  const detail = usePullRequestDetail(repoPath.data ?? undefined, prNumber);

  const markdownFiles = useMemo(
    () => (files.data ?? []).filter((f) => isMarkdownPath(f.path)),
    [files.data],
  );
  const filteredFiles = useMemo(
    () => filterChangedFiles(markdownFiles, debouncedFilter),
    [markdownFiles, debouncedFilter],
  );
  const totalFiles = files.data?.length ?? 0;
  const hiddenCount = totalFiles - markdownFiles.length;

  if (!isValidPrNumber) {
    return (
      <PreviewSlot>
        <InvalidPullRequestAlert value={rawNumber} />
      </PreviewSlot>
    );
  }

  const basePath = `/repo/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${prNumber}`;

  const subtitle = files.data
    ? hiddenCount > 0
      ? t("fileExplorer.sidebar.summaryHidden", {
          shown: filteredFiles.length,
          total: markdownFiles.length,
          hidden: hiddenCount,
        })
      : t("fileExplorer.sidebar.summary", {
          shown: filteredFiles.length,
          total: markdownFiles.length,
        })
    : t("fileExplorer.sidebar.fallbackSubtitle", { number: prNumber });

  const repoPathMissing = !repoPath.isLoading && repoPath.data === null;
  const sidebarLoading = repoPath.isLoading || (Boolean(repoPath.data) && files.isLoading);

  return (
    <>
      <SidebarShell
        title={t("fileExplorer.sidebar.title")}
        subtitle={subtitle}
        toolbar={<FileTreeSearch value={filterQuery} onChange={setFilterQuery} />}
      >
        <PullRequestSidebar
          owner={owner}
          repo={repo}
          selectedPath={selectedPath}
          basePath={basePath}
          debouncedFilter={debouncedFilter}
          filteredFiles={filteredFiles}
          markdownFileCount={markdownFiles.length}
          totalFileCount={totalFiles}
          repoPathError={repoPath.error}
          isRepoPathMissing={repoPathMissing}
          isLoading={sidebarLoading}
          filesError={files.error}
        />
      </SidebarShell>
      <PreviewSlot
        toolbar={
          <span className="text-xs text-[hsl(var(--muted-foreground))]">
            {selectedPath ?? t("fileExplorer.preview.fallbackToolbarLabel", { number: prNumber })}
          </span>
        }
        emptyHint={t("fileExplorer.preview.noFileSelected")}
      >
        {selectedPath && prNumber !== undefined ? (
          <PreviewArea
            repoPath={repoPath.data ?? undefined}
            sha={detail.data?.headSha}
            filePath={selectedPath}
            isDetailLoading={repoPath.isLoading || detail.isLoading}
            prNumber={prNumber}
          />
        ) : null}
      </PreviewSlot>
      <ThreadsPane />
    </>
  );
}

function decodePath(raw: string): string {
  return raw.split("/").map(decodeURIComponent).join("/");
}

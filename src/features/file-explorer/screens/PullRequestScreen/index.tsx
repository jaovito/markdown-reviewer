import { PreviewSlot, SidebarShell, ThreadsPane, useRepoContext } from "@/features/main";
import { scrollToAnchorLine } from "@/features/main/lib/scrollToAnchor";
import { usePullRequestDetail } from "@/features/markdown-preview";
import type { HeadingItem } from "@/features/markdown-preview/lib/extractHeadings";
import { useRepoPath } from "@/features/pull-requests";
import { useDebouncedValue } from "@/shared/hooks/useDebouncedValue";
import { useLastPullRequest } from "@/shared/stores/useLastPullRequest";
import { useSidebarCollapse } from "@/shared/stores/useSidebarCollapse";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { FileTreeSearch } from "../../components/FileTreeSearch";
import { useChangedFiles } from "../../hooks/useChangedFiles";
import { isMarkdownPath } from "../../lib/buildTree";
import { filterChangedFiles } from "../../lib/filterFiles";
import { InvalidPullRequestAlert } from "./InvalidPullRequestAlert";
import { PreviewArea } from "./PreviewArea";
import { PreviewToolbar } from "./PreviewToolbar";
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

  const isLeftCollapsed = useSidebarCollapse((s) => s.isLeftCollapsed);
  const toggleLeft = useSidebarCollapse((s) => s.toggleLeft);
  const isRightCollapsed = useSidebarCollapse((s) => s.isRightCollapsed);
  const toggleRight = useSidebarCollapse((s) => s.toggleRight);

  const [filterQuery, setFilterQuery] = useState("");
  const debouncedFilter = useDebouncedValue(filterQuery);

  const [headings, setHeadings] = useState<HeadingItem[]>([]);
  const searchTriggerRef = useRef<(() => void) | null>(null);

  const handleRegisterSearchTrigger = useCallback((trigger: () => void) => {
    searchTriggerRef.current = trigger;
  }, []);

  const handleOpenSearch = useCallback(() => {
    searchTriggerRef.current?.();
  }, []);

  const repoPath = useRepoPath(owner, repo);
  const files = useChangedFiles(repoPath.data ?? undefined, prNumber);
  const detail = usePullRequestDetail(repoPath.data ?? undefined, prNumber);

  const prFilePaths = useMemo(() => (files.data ?? []).map((f) => f.path), [files.data]);
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
          <PreviewToolbar
            selectedPath={selectedPath}
            prNumber={prNumber}
            headings={headings}
            onSelectHeading={scrollToAnchorLine}
            onOpenSearch={handleOpenSearch}
            isLeftCollapsed={isLeftCollapsed}
            onToggleLeft={toggleLeft}
            isRightCollapsed={isRightCollapsed}
            onToggleRight={toggleRight}
          />
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
            owner={owner}
            repo={repo}
            prFiles={prFilePaths}
            onHeadingsExtracted={setHeadings}
            onRegisterSearchTrigger={handleRegisterSearchTrigger}
          />
        ) : null}
      </PreviewSlot>
      <ThreadsPane
        prNumber={prNumber}
        filePath={selectedPath}
        repoPath={repoPath.data ?? undefined}
        sha={detail.data?.headSha}
      />
    </>
  );
}

function decodePath(raw: string): string {
  return raw.split("/").map(decodeURIComponent).join("/");
}

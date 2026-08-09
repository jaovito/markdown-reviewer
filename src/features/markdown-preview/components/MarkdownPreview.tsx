import { InlineThreads, SelectionCommentOverlay, useFileComments } from "@/features/comments";
import { scrollToAnchorLine } from "@/features/main/lib/scrollToAnchor";
import type { CommentAnchor, DiffHunk } from "@/shared/ipc/contract";
import { cn } from "@/shared/lib/cn";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useDocumentSearch } from "../hooks/useDocumentSearch";
import { type HeadingItem, extractHeadings } from "../lib/extractHeadings";
import { renderMarkdown } from "../lib/pipeline";
import { DiffGutter } from "./DiffGutter";
import { DocumentSearchBar } from "./DocumentSearchBar";

interface MarkdownPreviewProps {
  source: string;
  className?: string;
  hunks?: DiffHunk[];
  /** When prNumber + filePath + headSha are present, mounts the comments UI. */
  repoPath?: string;
  prNumber?: number;
  filePath?: string;
  headSha?: string;
  onHeadingsExtracted?: (headings: HeadingItem[]) => void;
  onRegisterSearchTrigger?: (trigger: () => void) => void;
}

export function MarkdownPreview({
  source,
  className,
  hunks,
  repoPath,
  prNumber,
  filePath,
  headSha,
  onHeadingsExtracted,
  onRegisterSearchTrigger,
}: MarkdownPreviewProps) {
  const html = useMemo(() => renderMarkdown(source), [source]);
  const headings = useMemo(() => extractHeadings(source), [source]);

  // Notify parent component of extracted headings whenever source changes
  useEffect(() => {
    onHeadingsExtracted?.(headings);
  }, [headings, onHeadingsExtracted]);

  const articleRef = useRef<HTMLElement>(null);
  const commentsEnabled = Boolean(prNumber && filePath && headSha);
  const fileComments = useFileComments({ prNumber, filePath });
  const comments = fileComments.data ?? [];
  const [composerAnchor, setComposerAnchor] = useState<CommentAnchor | null>(null);

  // In-document text search engine hook
  const search = useDocumentSearch({
    containerRef: articleRef,
    sourceHtml: html,
  });

  // Register search trigger callback to parent toolbar
  useEffect(() => {
    onRegisterSearchTrigger?.(search.openSearch);
  }, [search.openSearch, onRegisterSearchTrigger]);

  // When the user lands on the preview via a thread-pane click, the URL hash
  // carries the target line (e.g. `#L42`). Scroll once the markdown finishes rendering.
  const location = useLocation();
  // biome-ignore lint/correctness/useExhaustiveDependencies: html and location.key are intentional re-run triggers
  useEffect(() => {
    const match = /^#L(\d+)$/.exec(location.hash);
    if (!match) return;
    const line = Number(match[1]);
    if (!Number.isFinite(line) || line <= 0) return;
    requestAnimationFrame(() => scrollToAnchorLine(line));
  }, [html, location.hash, location.key]);

  return (
    <div className="relative mx-auto w-full max-w-3xl">
      <DocumentSearchBar
        isOpen={search.isOpen}
        query={search.query}
        onQueryChange={search.setQuery}
        isCaseSensitive={search.isCaseSensitive}
        onToggleCaseSensitive={search.toggleCaseSensitive}
        currentIndex={search.currentIndex}
        matchCount={search.matchCount}
        onNextMatch={search.nextMatch}
        onPrevMatch={search.prevMatch}
        onClose={search.closeSearch}
      />
      {hunks && hunks.length > 0 ? <DiffGutter hunks={hunks} containerRef={articleRef} /> : null}
      <article
        ref={articleRef}
        className={cn("prose-styles px-8 py-8 text-[15px] leading-7", className)}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized via rehype-sanitize.
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {commentsEnabled ? (
        <>
          <InlineThreads
            repoPath={repoPath}
            prNumber={prNumber as number}
            filePath={filePath as string}
            headSha={headSha as string}
            comments={comments}
            containerRef={articleRef}
            composerAnchor={composerAnchor}
            onComposerClose={() => setComposerAnchor(null)}
          />
          <SelectionCommentOverlay
            containerRef={articleRef}
            disabled={composerAnchor !== null}
            onStartComposer={(a) => setComposerAnchor(a)}
          />
        </>
      ) : null}
    </div>
  );
}

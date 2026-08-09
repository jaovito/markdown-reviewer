import {
  InlineThreads,
  SelectionCommentOverlay,
  anchorEndLine,
  anchorStartLine,
  useFileComments,
} from "@/features/comments";
import { scrollToAnchorId, scrollToAnchorLine } from "@/features/main/lib/scrollToAnchor";
import { i18next } from "@/shared/i18n";
import type { CommentAnchor, DiffHunk } from "@/shared/ipc/contract";
import { cn } from "@/shared/lib/cn";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useDocumentSearch } from "../hooks/useDocumentSearch";
import { useMermaid } from "../hooks/useMermaid";
import { type HeadingItem, extractHeadings } from "../lib/extractHeadings";
import { type RenderContext, renderMarkdown } from "../lib/pipeline";
import { DiffGutter } from "./DiffGutter";
import { DocumentSearchBar } from "./DocumentSearchBar";
import { MermaidLightbox } from "./MermaidLightbox";

interface MarkdownPreviewProps {
  source: string;
  className?: string;
  hunks?: DiffHunk[];
  /** When prNumber + filePath + headSha are present, mounts the comments UI. */
  repoPath?: string;
  prNumber?: number;
  filePath?: string;
  headSha?: string;
  /** When present, relative images and local links resolve against the PR. */
  renderContext?: RenderContext;
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
  renderContext,
  onHeadingsExtracted,
  onRegisterSearchTrigger,
}: MarkdownPreviewProps) {
  const html = useMemo(() => renderMarkdown(source, renderContext), [source, renderContext]);
  const headings = useMemo(() => extractHeadings(source), [source]);

  // Notify parent component of extracted headings whenever source changes
  useEffect(() => {
    onHeadingsExtracted?.(headings);
  }, [headings, onHeadingsExtracted]);

  const articleRef = useRef<HTMLElement>(null);
  // Render any Mermaid diagrams in the freshly-mounted HTML (client-side);
  // clicking one opens the zoom/pan lightbox.
  const [zoomSvg, setZoomSvg] = useState<string | null>(null);
  const openZoom = useCallback((svg: string) => setZoomSvg(svg), []);
  const closeZoom = useCallback(() => setZoomSvg(null), []);
  useMermaid(articleRef, html, openZoom);
  const commentsEnabled = Boolean(prNumber && filePath && headSha);
  const fileComments = useFileComments({ prNumber, filePath });
  const comments = fileComments.data ?? [];
  const [composerAnchors, setComposerAnchors] = useState<CommentAnchor[]>([]);

  const handleStartComposer = useCallback((anchor: CommentAnchor) => {
    setComposerAnchors((prev) => {
      const start = anchorStartLine(anchor);
      const end = Math.max(start, anchorEndLine(anchor));
      const exists = prev.some((a) => {
        const s = anchorStartLine(a);
        const e = Math.max(s, anchorEndLine(a));
        return s === start && e === end;
      });
      if (exists) return prev;
      return [...prev, anchor];
    });
  }, []);

  const handleCloseComposer = useCallback((anchor: CommentAnchor) => {
    setComposerAnchors((prev) => {
      const start = anchorStartLine(anchor);
      const end = Math.max(start, anchorEndLine(anchor));
      return prev.filter((a) => {
        const s = anchorStartLine(a);
        const e = Math.max(s, anchorEndLine(a));
        return !(s === start && e === end);
      });
    });
  }, []);

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

  // One delegated listener for every link in the document. `rehypeLinks` has
  // already classified each anchor; this only acts on the classification.
  const onArticleClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    const anchor = (event.target as HTMLElement).closest("a");
    if (!anchor) return;
    const kind = anchor.dataset.linkKind;

    if (kind === "anchor") {
      // Under HashRouter an unhandled `#id` click rewrites the route.
      event.preventDefault();
      scrollToAnchorId(anchor.dataset.href ?? "");
      return;
    }

    if (kind === "external" || kind === "github") {
      event.preventDefault();
      const url = kind === "external" ? anchor.getAttribute("href") : anchor.dataset.href;
      if (url) void openUrl(url).catch(() => undefined);
      return;
    }

    if (kind === "inert") event.preventDefault();
    // `internal` is a plain hash href — HashRouter handles it natively.
  }, []);

  // Flags images the mdasset:// handler couldn't resolve, so CSS can show a
  // placeholder instead of the WebView's broken-image glyph.
  // biome-ignore lint/correctness/useExhaustiveDependencies: html is an intentional re-run trigger to re-attach image error listeners on new content.
  useEffect(() => {
    const root = articleRef.current;
    if (!root) return;
    const onError = (event: Event) => {
      const target = event.target as HTMLElement;
      if (target.tagName === "IMG") {
        target.dataset.broken = "true";
        target.title = i18next.t("markdownPreview.image.unavailable");
      }
    };
    root.addEventListener("error", onError, true); // capture: `error` doesn't bubble
    return () => root.removeEventListener("error", onError, true);
  }, [html]);

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
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: delegated click listener over rendered content. */}
      <article
        ref={articleRef}
        onClick={onArticleClick}
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
            composerAnchors={composerAnchors}
            onComposerClose={handleCloseComposer}
          />
          <SelectionCommentOverlay
            containerRef={articleRef}
            onStartComposer={handleStartComposer}
          />
        </>
      ) : null}
      {zoomSvg ? <MermaidLightbox svg={zoomSvg} onClose={closeZoom} /> : null}
    </div>
  );
}

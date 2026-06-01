import { InlineThreads, SelectionCommentOverlay, useFileComments } from "@/features/comments";
import { scrollToAnchorLine } from "@/features/main/lib/scrollToAnchor";
import type { CommentAnchor, DiffHunk } from "@/shared/ipc/contract";
import { cn } from "@/shared/lib/cn";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { renderMarkdown } from "../lib/pipeline";
import { DiffGutter } from "./DiffGutter";

interface MarkdownPreviewProps {
  source: string;
  className?: string;
  hunks?: DiffHunk[];
  /** When prNumber + filePath + headSha are present, mounts the comments UI. */
  repoPath?: string;
  prNumber?: number;
  filePath?: string;
  headSha?: string;
}

export function MarkdownPreview({
  source,
  className,
  hunks,
  repoPath,
  prNumber,
  filePath,
  headSha,
}: MarkdownPreviewProps) {
  const html = useMemo(() => renderMarkdown(source), [source]);
  const articleRef = useRef<HTMLElement>(null);
  const commentsEnabled = Boolean(prNumber && filePath && headSha);
  const fileComments = useFileComments({ prNumber, filePath });
  const comments = fileComments.data ?? [];
  const [composerAnchor, setComposerAnchor] = useState<CommentAnchor | null>(null);

  // When the user lands on the preview via a thread-pane click, the URL hash
  // carries the target line (e.g. `#L42`). Scroll once the markdown finishes
  // rendering — `requestAnimationFrame` waits for the next paint so the
  // `[data-source-line]` nodes are mounted before we query them. We depend on
  // `html` + `location.key` (not read) so navigating to the same URL or
  // landing on a freshly-rendered file both trigger a re-scroll.
  const location = useLocation();
  // biome-ignore lint/correctness/useExhaustiveDependencies: html and location.key are intentional re-run triggers; their values aren't read in the body.
  useEffect(() => {
    const match = /^#L(\d+)$/.exec(location.hash);
    if (!match) return;
    const line = Number(match[1]);
    if (!Number.isFinite(line) || line <= 0) return;
    requestAnimationFrame(() => scrollToAnchorLine(line));
  }, [html, location.hash, location.key]);

  return (
    <div className="relative mx-auto w-full max-w-3xl">
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

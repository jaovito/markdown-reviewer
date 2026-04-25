import { InlineThreads, SelectionCommentOverlay, useFileComments } from "@/features/comments";
import type { CommentAnchor, DiffHunk } from "@/shared/ipc/contract";
import { cn } from "@/shared/lib/cn";
import { useMemo, useRef, useState } from "react";
import { renderMarkdown } from "../lib/pipeline";
import { DiffGutter } from "./DiffGutter";

interface MarkdownPreviewProps {
  source: string;
  className?: string;
  hunks?: DiffHunk[];
  /** When prNumber + filePath + headSha are present, mounts the comments UI. */
  prNumber?: number;
  filePath?: string;
  headSha?: string;
}

export function MarkdownPreview({
  source,
  className,
  hunks,
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

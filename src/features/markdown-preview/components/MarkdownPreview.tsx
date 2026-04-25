import type { DiffHunk } from "@/shared/ipc/contract";
import { cn } from "@/shared/lib/cn";
import { useMemo, useRef } from "react";
import { renderMarkdown } from "../lib/pipeline";
import { DiffGutter } from "./DiffGutter";

interface MarkdownPreviewProps {
  source: string;
  className?: string;
  hunks?: DiffHunk[];
}

export function MarkdownPreview({ source, className, hunks }: MarkdownPreviewProps) {
  const html = useMemo(() => renderMarkdown(source), [source]);
  const articleRef = useRef<HTMLElement>(null);
  return (
    <div className="relative mx-auto w-full max-w-3xl">
      {hunks && hunks.length > 0 ? <DiffGutter hunks={hunks} containerRef={articleRef} /> : null}
      <article
        ref={articleRef}
        className={cn("prose-styles px-8 py-8 text-[15px] leading-7", className)}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized via rehype-sanitize.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

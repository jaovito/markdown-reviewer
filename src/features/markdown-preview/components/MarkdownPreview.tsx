import { cn } from "@/shared/lib/cn";
import { useMemo } from "react";
import { renderMarkdown } from "../lib/pipeline";

interface MarkdownPreviewProps {
  source: string;
  className?: string;
}

export function MarkdownPreview({ source, className }: MarkdownPreviewProps) {
  const html = useMemo(() => renderMarkdown(source), [source]);
  return (
    <article
      className={cn(
        "prose-styles mx-auto w-full max-w-3xl px-8 py-8 text-[15px] leading-7",
        className,
      )}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized via rehype-sanitize.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

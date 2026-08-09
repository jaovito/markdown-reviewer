import { useFileSource } from "@/features/comments/hooks/useFileSource";
import { sliceSnippet } from "@/features/comments/lib/sliceSnippet";
import { Skeleton } from "@/shared/ui/skeleton";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

const MAX_VISIBLE = 3;

interface ThreadSnippetProps {
  repoPath: string | undefined;
  sha: string | undefined;
  filePath: string;
  startLine: number;
  endLine: number;
}

export function ThreadSnippet({ repoPath, sha, filePath, startLine, endLine }: ThreadSnippetProps) {
  const { t } = useTranslation();
  const { lines, isLoading, error } = useFileSource(repoPath, sha, filePath);

  const slice = useMemo(
    () => (lines ? sliceSnippet(lines, startLine, endLine, MAX_VISIBLE) : null),
    [lines, startLine, endLine],
  );

  // Without repoPath/sha the query is disabled and never produces lines or an
  // error, so the loading branch below would show a skeleton forever. Omit
  // the snippet entirely instead.
  if (!repoPath || !sha) return null;

  if (isLoading || (!lines && !error)) {
    return (
      <div className="my-1.5 flex flex-col gap-1">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
        <Skeleton className="h-3 w-4/6" />
      </div>
    );
  }

  if (!slice || slice.visible.length === 0) {
    return null;
  }

  return (
    <div
      className="my-1.5 rounded border-[hsl(var(--comment-marker-fg))] border-l-[1.5px] bg-[hsl(var(--muted))]/30 py-1 pl-2 font-mono text-[11px] leading-snug"
      data-thread-snippet="true"
    >
      <pre className="overflow-x-hidden whitespace-pre-wrap break-words text-[hsl(var(--foreground))]/85">
        {slice.visible.join("\n")}
      </pre>
      {slice.more > 0 ? (
        <p className="mt-1 text-[10px] text-[hsl(var(--muted-foreground))]">
          {t("threads.snippet.moreLines", { count: slice.more })}
        </p>
      ) : null}
    </div>
  );
}

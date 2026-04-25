import type { CommentAnchor } from "@/shared/ipc/contract";
import { useTranslation } from "react-i18next";

interface AnchorLabelProps {
  filePath: string;
  anchor: CommentAnchor;
  /** When true, hide the file path and only render the line indicator. */
  lineOnly?: boolean;
}

/**
 * Renders an anchor descriptor like `README.md L4` or `docs/a.md L12–L14`.
 * Code-block anchors collapse to their `(startLine, endLine)` extent because
 * the user perceives them as a single block in the preview.
 */
export function AnchorLabel({ filePath, anchor, lineOnly = false }: AnchorLabelProps) {
  const { t } = useTranslation();
  const lineLabel =
    anchor.kind === "singleLine"
      ? t("threads.row.anchorLine", { line: anchor.line })
      : anchor.startLine === anchor.endLine
        ? t("threads.row.anchorLine", { line: anchor.startLine })
        : t("threads.row.anchorRange", { start: anchor.startLine, end: anchor.endLine });

  if (lineOnly) {
    return <span className="font-mono text-[11px]">{lineLabel}</span>;
  }
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="truncate font-medium">{filePath}</span>
      <span className="font-mono text-[11px] text-[hsl(var(--muted-foreground))]">{lineLabel}</span>
    </span>
  );
}

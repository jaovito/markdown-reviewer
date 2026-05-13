import type { CommentState } from "@/shared/ipc/contract";
import { cn } from "@/shared/lib/cn";
import { CornerDownRightIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

interface RangeHeaderChipProps {
  startLine: number;
  endLine: number;
  count: number;
  state: CommentState;
  onJump: () => void;
}

export function RangeHeaderChip({
  startLine,
  endLine,
  count,
  state,
  onJump,
}: RangeHeaderChipProps) {
  const { t } = useTranslation();
  const muted = state === "resolved" || state === "hidden";
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border px-2 py-1 text-[11px]",
        "border-[hsl(var(--comment-marker-border))] bg-[hsl(var(--comment-marker-bg))]",
        "text-[hsl(var(--comment-marker-fg))] shadow-sm",
        muted ? "opacity-70" : null,
      )}
      data-comment-range-header="true"
    >
      <span className="font-mono">
        {t("comments.range.headerLabel", { count, start: startLine, end: endLine })}
      </span>
      <span className="ml-auto" />
      <button
        type="button"
        onClick={onJump}
        aria-label={t("comments.range.jumpAria")}
        className={cn(
          "inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium",
          "hover:bg-[hsl(var(--comment-marker-hover))]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
        )}
      >
        <CornerDownRightIcon className="h-3 w-3" aria-hidden="true" />
        <span>{t("comments.range.jump")}</span>
      </button>
    </div>
  );
}

import { cn } from "@/shared/lib/cn";
import { CheckIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

interface ResolvedThreadMarkerProps {
  count: number;
  onExpand: () => void;
}

/**
 * Subtle gutter marker rendered at the end of a resolved thread's anchor
 * line in place of the full inline card. Clicking it expands the thread
 * and triggers a temporary highlight on the anchor line(s).
 *
 * Visually distinct from `MinimizedThreadBadge` (resolved threads use a
 * check glyph + muted palette so they read as "settled" rather than "open
 * but hidden").
 */
export function ResolvedThreadMarker({ count, onExpand }: ResolvedThreadMarkerProps) {
  const { t } = useTranslation();
  const ariaLabel =
    count > 1
      ? t("comments.markers.resolvedAriaWithCount", { count })
      : t("comments.markers.resolvedAria");
  return (
    <button
      type="button"
      onClick={onExpand}
      aria-label={ariaLabel}
      title={ariaLabel}
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-full px-1.5 align-middle text-[10px] font-medium",
        "border border-[hsl(var(--border))] bg-transparent",
        "text-[hsl(var(--muted-foreground))] transition-colors",
        "hover:border-[hsl(var(--comment-marker-border))] hover:bg-[hsl(var(--comment-marker-hover))] hover:text-[hsl(var(--comment-marker-fg))]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
      )}
    >
      <CheckIcon className="h-3 w-3" aria-hidden="true" />
      {count > 1 ? <span aria-hidden="true">{count}</span> : null}
    </button>
  );
}

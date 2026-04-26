import { cn } from "@/shared/lib/cn";
import { MessageSquareIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

interface MinimizedThreadBadgeProps {
  count: number;
  onExpand: () => void;
}

/**
 * Tiny pill rendered at the end of a collapsed thread's anchor line. Just the
 * `message-square` icon plus a count when more than one comment is attached.
 * Clicking it re-expands the thread card.
 */
export function MinimizedThreadBadge({ count, onExpand }: MinimizedThreadBadgeProps) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onExpand}
      aria-label={t("comments.markers.expandAria")}
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-full px-1.5 align-middle text-[11px] font-semibold",
        "border border-[hsl(var(--comment-marker-border))] bg-[hsl(var(--comment-marker-bg))]",
        "text-[hsl(var(--comment-marker-fg))] transition-colors",
        "hover:bg-[hsl(var(--comment-marker-hover))]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
      )}
    >
      <MessageSquareIcon className="h-3 w-3" aria-hidden="true" />
      {count > 1 ? <span aria-hidden="true">{count}</span> : null}
    </button>
  );
}

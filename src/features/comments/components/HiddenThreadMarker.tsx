import { cn } from "@/shared/lib/cn";
import { MessageSquareOffIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

interface HiddenThreadMarkerProps {
  count: number;
  /**
   * Restores the thread to a non-hidden state via IPC. The caller decides the
   * target state (`submitted` when the comment has a `githubId`, otherwise
   * `draft`) — this component only invokes the action.
   */
  onUnhide: () => void;
}

/**
 * Discreet gutter marker rendered in place of the inline thread card when
 * every comment on an anchor is in the `hidden` state. Clicking it unhides
 * the thread (restores it to `submitted` or `draft` depending on whether it
 * has a remote GitHub id) so the user can see and act on it again.
 */
export function HiddenThreadMarker({ count, onUnhide }: HiddenThreadMarkerProps) {
  const { t } = useTranslation();
  const ariaLabel =
    count > 1
      ? t("comments.markers.unhideAriaWithCount", { count })
      : t("comments.markers.unhideAria");
  return (
    <button
      type="button"
      onClick={onUnhide}
      aria-label={ariaLabel}
      title={ariaLabel}
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-full px-1.5 align-middle text-[11px] font-medium",
        "border border-[hsl(var(--comment-marker-border))] bg-transparent",
        "text-[hsl(var(--muted-foreground))] transition-colors",
        "hover:bg-[hsl(var(--comment-marker-hover))] hover:text-[hsl(var(--comment-marker-fg))]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
      )}
    >
      <MessageSquareOffIcon className="h-3 w-3" aria-hidden="true" />
      {count > 1 ? <span aria-hidden="true">{count}</span> : null}
    </button>
  );
}

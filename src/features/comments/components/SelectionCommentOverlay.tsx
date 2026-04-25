import type { CommentAnchor } from "@/shared/ipc/contract";
import { cn } from "@/shared/lib/cn";
import { MessageSquareIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { resolveAnchor } from "../lib/selectionToAnchor";

interface SelectionCommentOverlayProps {
  containerRef: React.RefObject<HTMLElement | null>;
  /** Suppress the floating button (e.g. while a composer is already open). */
  disabled?: boolean;
  onStartComposer: (anchor: CommentAnchor) => void;
}

interface FloatingState {
  anchor: CommentAnchor;
  /** Position relative to `container`. */
  buttonTop: number;
  buttonLeft: number;
}

const BUTTON_OFFSET_Y = 6;
const BUTTON_WIDTH = 110;
const SAFE_PADDING = 8;

/**
 * Listens for text selections inside `container` and surfaces a floating
 * "Comment" button anchored to the selection. Clicking it lifts the chosen
 * anchor up to the parent so the inline composer can open at that line.
 */
export function SelectionCommentOverlay({
  containerRef,
  disabled = false,
  onStartComposer,
}: SelectionCommentOverlayProps) {
  const { t } = useTranslation();
  const [floating, setFloating] = useState<FloatingState | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (disabled) {
      setFloating(null);
      return;
    }

    function refresh() {
      const article = containerRef.current;
      if (!article) return;
      const selection = window.getSelection();
      if (!selection) {
        setFloating(null);
        return;
      }
      const result = resolveAnchor(article, selection);
      if (!result) {
        setFloating(null);
        return;
      }
      const containerRect = article.getBoundingClientRect();
      const rawLeft = result.rangeRect.right - containerRect.left - BUTTON_WIDTH;
      const rawTop = result.rangeRect.bottom - containerRect.top + BUTTON_OFFSET_Y;
      const maxLeft = Math.max(SAFE_PADDING, containerRect.width - SAFE_PADDING - BUTTON_WIDTH);
      const left = Math.min(Math.max(SAFE_PADDING, rawLeft), maxLeft);
      const top = Math.max(SAFE_PADDING, rawTop);
      setFloating({ anchor: result.anchor, buttonLeft: left, buttonTop: top });
    }

    document.addEventListener("selectionchange", refresh);
    window.addEventListener("resize", refresh);
    return () => {
      document.removeEventListener("selectionchange", refresh);
      window.removeEventListener("resize", refresh);
    };
  }, [containerRef, disabled]);

  function open() {
    if (!floating) return;
    const anchor = floating.anchor;
    setFloating(null);
    window.getSelection()?.removeAllRanges();
    onStartComposer(anchor);
  }

  if (!floating || disabled) return null;

  return (
    <button
      type="button"
      onMouseDown={(event) => {
        // Prevent the click from collapsing the selection before we read it.
        event.preventDefault();
      }}
      onClick={open}
      aria-label={t("comments.markers.selectionAria")}
      className={cn(
        "absolute z-30 inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[12px]",
        "border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))] shadow-md",
        "transition-colors hover:bg-[hsl(var(--accent))]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
      )}
      style={{ top: floating.buttonTop, left: floating.buttonLeft, width: BUTTON_WIDTH }}
    >
      <MessageSquareIcon
        className="h-3.5 w-3.5 text-[hsl(var(--muted-foreground))]"
        aria-hidden="true"
      />
      <span>{t("comments.composer.commentAction")}</span>
    </button>
  );
}

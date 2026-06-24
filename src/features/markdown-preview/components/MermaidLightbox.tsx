import { Button } from "@/shared/ui/button";
import { MaximizeIcon, XIcon, ZoomInIcon, ZoomOutIcon } from "lucide-react";
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

interface MermaidLightboxProps {
  /** The rendered diagram SVG markup (already sanitized by Mermaid). */
  svg: string;
  onClose: () => void;
}

const MIN_SCALE = 0.25;
const MAX_SCALE = 8;
const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

/**
 * Fullscreen overlay that shows a single Mermaid diagram with scroll/buttons
 * zoom and drag-to-pan. Opened by clicking a rendered diagram in the preview;
 * closed via the X button, Escape, or clicking the backdrop. The SVG is
 * Mermaid's own output (rendered under `securityLevel: "strict"`), so injecting
 * it here carries the same trust level as the inline diagram.
 */
export function MermaidLightbox({ svg, onClose }: MermaidLightboxProps) {
  const { t } = useTranslation();
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragging = useRef(false);
  const last = useRef({ x: 0, y: 0 });

  const reset = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    setScale((s) => clampScale(s * (e.deltaY < 0 ? 1.1 : 0.9)));
  }, []);

  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    dragging.current = true;
    setIsDragging(true);
    last.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: ReactPointerEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - last.current.x;
    const dy = e.clientY - last.current.y;
    last.current = { x: e.clientX, y: e.clientY };
    setOffset((o) => ({ x: o.x + dx, y: o.y + dy }));
  }, []);

  const onPointerUp = useCallback(() => {
    dragging.current = false;
    setIsDragging(false);
  }, []);

  return createPortal(
    <div
      className="mermaid-lightbox"
      // biome-ignore lint/a11y/useSemanticElements: a custom pan/zoom overlay, not a native <dialog>; Escape-to-close is wired via the keydown listener above.
      role="dialog"
      aria-modal="true"
      aria-label={t("markdownPreview.mermaid.openAria")}
    >
      <div className="mermaid-lightbox-toolbar">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-8"
          onClick={() => setScale((s) => clampScale(s * 1.25))}
          aria-label={t("markdownPreview.mermaid.zoomIn")}
        >
          <ZoomInIcon className="size-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-8"
          onClick={() => setScale((s) => clampScale(s / 1.25))}
          aria-label={t("markdownPreview.mermaid.zoomOut")}
        >
          <ZoomOutIcon className="size-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-8"
          onClick={reset}
          aria-label={t("markdownPreview.mermaid.reset")}
        >
          <MaximizeIcon className="size-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-8"
          onClick={onClose}
          aria-label={t("markdownPreview.mermaid.close")}
          autoFocus
        >
          <XIcon className="size-4" />
        </Button>
      </div>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: clicking the empty stage (backdrop) closes; keyboard close is the global Escape handler above. */}
      <div
        className="mermaid-lightbox-stage"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ cursor: isDragging ? "grabbing" : "grab" }}
      >
        <div
          className="mermaid-lightbox-content"
          style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
          // biome-ignore lint/security/noDangerouslySetInnerHtml: Mermaid SVG rendered under securityLevel "strict".
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
    </div>,
    document.body,
  );
}

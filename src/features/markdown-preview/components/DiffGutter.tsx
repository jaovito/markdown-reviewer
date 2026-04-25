import type { DiffHunk } from "@/shared/ipc/contract";
import { cn } from "@/shared/lib/cn";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

interface DiffGutterProps {
  hunks: DiffHunk[];
  /** Element whose descendants carry `data-source-line` attributes. */
  containerRef: React.RefObject<HTMLElement | null>;
}

interface Marker {
  top: number;
  height: number;
  kind: DiffHunk["kind"];
}

/**
 * Overlays a left-edge gutter that highlights the line ranges touched by a
 * PR. Reads `data-source-line` from rendered nodes (injected by the
 * `remarkSourceLine` plugin) and turns them into absolute-positioned bars.
 */
export function DiffGutter({ hunks, containerRef }: DiffGutterProps) {
  const ownRef = useRef<HTMLDivElement>(null);
  const [markers, setMarkers] = useState<Marker[]>([]);

  useLayoutEffect(() => {
    if (!containerRef.current || !ownRef.current) return;
    setMarkers(computeMarkers(containerRef.current, ownRef.current, hunks));
  }, [hunks, containerRef]);

  useEffect(() => {
    if (!containerRef.current || !ownRef.current) return;
    const ro = new ResizeObserver(() => {
      if (containerRef.current && ownRef.current) {
        setMarkers(computeMarkers(containerRef.current, ownRef.current, hunks));
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [hunks, containerRef]);

  return (
    <div
      ref={ownRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 left-0 w-1.5"
    >
      {markers.map((m, i) => (
        <span
          key={`${m.top}-${i}`}
          className={cn(
            "absolute left-0 w-1 rounded-sm",
            m.kind === "added" ? "bg-emerald-500/70" : "bg-amber-500/70",
          )}
          style={{ top: m.top, height: m.height }}
        />
      ))}
    </div>
  );
}

function computeMarkers(container: HTMLElement, gutter: HTMLElement, hunks: DiffHunk[]): Marker[] {
  const nodes = Array.from(container.querySelectorAll<HTMLElement>("[data-source-line]"));
  if (nodes.length === 0) return [];

  // Build a sparse map: line → { top, bottom } in container coordinates.
  const containerRect = container.getBoundingClientRect();
  const gutterRect = gutter.getBoundingClientRect();
  const offset = containerRect.top - gutterRect.top;
  const lineRects = nodes.map((n) => ({
    line: Number(n.dataset.sourceLine ?? "0"),
    top: n.getBoundingClientRect().top - containerRect.top + offset,
    bottom: n.getBoundingClientRect().bottom - containerRect.top + offset,
  }));

  return hunks
    .map<Marker | null>((h) => {
      const hits = lineRects.filter((r) => r.line >= h.startLine && r.line <= h.endLine);
      const before = lineRects.filter((r) => r.line < h.startLine);
      const after = lineRects.filter((r) => r.line > h.endLine);

      const top = hits.length
        ? (hits[0]?.top ?? null)
        : before.length
          ? (before[before.length - 1]?.bottom ?? null)
          : null;
      const bottom = hits.length
        ? (hits[hits.length - 1]?.bottom ?? null)
        : after.length
          ? (after[0]?.top ?? null)
          : null;
      if (top == null || bottom == null) return null;
      const height = Math.max(2, bottom - top);
      return { top, height, kind: h.kind };
    })
    .filter((m): m is Marker => m !== null);
}

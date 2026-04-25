import {
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  useSidebarWidth,
} from "@/shared/stores/useSidebarWidth";
import { ScrollArea } from "@/shared/ui/scroll-area";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

interface SidebarShellProps {
  title: string;
  subtitle?: string;
  emptyHint?: string;
  children?: ReactNode;
  toolbar?: ReactNode;
}

export function SidebarShell({ title, subtitle, emptyHint, children, toolbar }: SidebarShellProps) {
  const width = useSidebarWidth((s) => s.width);
  const setWidth = useSidebarWidth((s) => s.setWidth);
  const asideRef = useRef<HTMLElement>(null);
  const [isResizing, setIsResizing] = useState(false);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsResizing(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  useEffect(() => {
    if (!isResizing) return;
    const onMove = (e: PointerEvent) => {
      const left = asideRef.current?.getBoundingClientRect().left ?? 0;
      setWidth(e.clientX - left);
    };
    const onUp = () => setIsResizing(false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setWidth]);

  return (
    <aside
      ref={asideRef}
      className="relative flex h-full shrink-0 flex-col border-r border-[hsl(var(--border))] bg-[hsl(var(--card))]"
      style={{ width }}
    >
      <div className="flex flex-col gap-1 px-4 pb-3 pt-4">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
          {title}
        </span>
        {subtitle ? (
          <span className="text-xs text-[hsl(var(--muted-foreground))]">{subtitle}</span>
        ) : null}
      </div>
      {toolbar ? <div className="px-4 pb-3">{toolbar}</div> : null}
      <ScrollArea className="flex-1">
        <div className="px-2 pb-3">
          {children ?? (
            <p className="px-2 py-6 text-xs text-[hsl(var(--muted-foreground))]">
              {emptyHint ?? "Nothing to show yet."}
            </p>
          )}
        </div>
      </ScrollArea>
      <div
        role="separator"
        tabIndex={0}
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        aria-valuenow={width}
        aria-valuemin={SIDEBAR_MIN_WIDTH}
        aria-valuemax={SIDEBAR_MAX_WIDTH}
        onPointerDown={onPointerDown}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setWidth(width - 16);
          else if (e.key === "ArrowRight") setWidth(width + 16);
        }}
        className="absolute inset-y-0 right-0 z-10 w-1 cursor-col-resize bg-transparent transition-colors hover:bg-[hsl(var(--accent))] focus-visible:bg-[hsl(var(--accent))] focus-visible:outline-none"
      />
    </aside>
  );
}

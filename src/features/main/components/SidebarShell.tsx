import { ScrollArea } from "@/shared/ui/scroll-area";
import type { ReactNode } from "react";

interface SidebarShellProps {
  title: string;
  subtitle?: string;
  emptyHint?: string;
  children?: ReactNode;
  toolbar?: ReactNode;
}

export function SidebarShell({ title, subtitle, emptyHint, children, toolbar }: SidebarShellProps) {
  return (
    <aside className="flex h-full w-[260px] shrink-0 flex-col border-r border-[hsl(var(--border))] bg-[hsl(var(--card))]">
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
    </aside>
  );
}

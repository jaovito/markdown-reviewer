import { ScrollArea } from "@/shared/ui/scroll-area";
import type { ReactNode } from "react";

interface SidebarShellProps {
  title: string;
  emptyHint?: string;
  children?: ReactNode;
  toolbar?: ReactNode;
}

export function SidebarShell({ title, emptyHint, children, toolbar }: SidebarShellProps) {
  return (
    <aside className="flex h-full flex-col bg-[hsl(var(--card))]">
      <div className="flex h-9 items-center px-3 text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
        {title}
      </div>
      {toolbar ? <div className="px-3 pb-2">{toolbar}</div> : null}
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

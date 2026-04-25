import { ScrollArea } from "@/shared/ui/scroll-area";
import { MessagesSquareIcon } from "lucide-react";

export function ThreadsPane() {
  return (
    <aside className="flex h-full flex-col border-l border-[hsl(var(--border))] bg-[hsl(var(--card))]">
      <div className="flex h-9 items-center justify-between px-3 text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
        Threads
      </div>
      <ScrollArea className="flex-1">
        <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-xs text-[hsl(var(--muted-foreground))]">
          <MessagesSquareIcon className="size-6 opacity-60" />
          <p>Comments will land here in Phase 3.</p>
        </div>
      </ScrollArea>
    </aside>
  );
}

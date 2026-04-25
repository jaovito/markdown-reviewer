import { FileTextIcon } from "lucide-react";
import type { ReactNode } from "react";

interface PreviewSlotProps {
  children?: ReactNode;
  emptyHint?: string;
  toolbar?: ReactNode;
}

export function PreviewSlot({ children, emptyHint, toolbar }: PreviewSlotProps) {
  return (
    <section className="flex h-full min-w-0 flex-1 flex-col bg-[hsl(var(--background))]">
      {toolbar ? (
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4">
          {toolbar}
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto">
        {children ?? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-sm text-[hsl(var(--muted-foreground))]">
            <FileTextIcon className="size-8 opacity-60" />
            <p>{emptyHint ?? "Pick a pull request and a Markdown file to start reviewing."}</p>
          </div>
        )}
      </div>
    </section>
  );
}

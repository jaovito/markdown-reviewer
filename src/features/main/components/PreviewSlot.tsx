import { FileTextIcon } from "lucide-react";
import type { ReactNode } from "react";

interface PreviewSlotProps {
  children?: ReactNode;
  emptyHint?: string;
}

export function PreviewSlot({ children, emptyHint }: PreviewSlotProps) {
  if (children) return <div className="h-full overflow-auto">{children}</div>;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-sm text-[hsl(var(--muted-foreground))]">
      <FileTextIcon className="size-8 opacity-60" />
      <p>{emptyHint ?? "Pick a pull request and a Markdown file to start reviewing."}</p>
    </div>
  );
}

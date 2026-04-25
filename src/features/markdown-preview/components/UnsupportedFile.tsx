import { FileXIcon } from "lucide-react";

export function UnsupportedFile({ path }: { path: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-sm text-[hsl(var(--muted-foreground))]">
      <FileXIcon className="size-8 opacity-60" />
      <p>
        Preview for{" "}
        <code className="rounded bg-[hsl(var(--muted))] px-1 py-0.5 text-xs">{path}</code> is not
        supported.
      </p>
      <p className="text-xs opacity-80">Markdown Reviewer renders Markdown files only.</p>
    </div>
  );
}

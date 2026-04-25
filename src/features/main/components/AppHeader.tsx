import { Button } from "@/shared/ui/button";
import { Separator } from "@/shared/ui/separator";
import { CheckIcon, GitBranchIcon } from "lucide-react";

interface AppHeaderProps {
  owner: string;
  repo: string;
  prNumber?: number;
  branch?: string | null;
  rightAction?: React.ReactNode;
}

export function AppHeader({ owner, repo, prNumber, branch, rightAction }: AppHeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] px-5">
      <div className="flex items-center gap-2.5">
        <div className="flex size-7 items-center justify-center rounded-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]">
          <span className="text-[11px] font-bold">M</span>
        </div>
        <span className="text-sm font-semibold tracking-tight">Markdown Reviewer</span>
      </div>
      <Separator orientation="vertical" className="h-5" />
      <span className="text-xs text-[hsl(var(--muted-foreground))]">
        {owner}/<span className="text-[hsl(var(--foreground))]">{repo}</span>
      </span>
      {prNumber ? (
        <>
          <span className="text-xs text-[hsl(var(--muted-foreground))]">/</span>
          <span className="text-xs font-medium">PR #{prNumber}</span>
        </>
      ) : null}
      <div className="ml-auto flex items-center gap-2">
        {rightAction}
        {branch ? (
          <span className="flex h-8 items-center gap-1.5 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/40 px-2.5 text-xs">
            <GitBranchIcon className="size-3.5 text-[hsl(var(--muted-foreground))]" />
            {branch}
          </span>
        ) : null}
        {prNumber ? (
          <Button size="sm" className="gap-1.5">
            <CheckIcon className="size-3.5" />
            Finish review
          </Button>
        ) : null}
      </div>
    </header>
  );
}

import { Button } from "@/shared/ui/button";
import { Separator } from "@/shared/ui/separator";
import { ChevronLeftIcon, GitBranchIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

interface ToolbarProps {
  owner: string;
  repo: string;
  branch?: string | null;
  rightSlot?: React.ReactNode;
}

export function Toolbar({ owner, repo, branch, rightSlot }: ToolbarProps) {
  const { t } = useTranslation();

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3">
      <Button asChild variant="ghost" size="sm">
        <Link to="/" aria-label={t("main.toolbar.backToRepositoriesAria")}>
          <ChevronLeftIcon className="size-4" />
        </Link>
      </Button>
      <Separator orientation="vertical" className="h-5" />
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="text-sm font-medium tracking-tight">
          {owner}/<span className="font-semibold">{repo}</span>
        </span>
        {branch ? (
          <span className="flex items-center gap-1 text-xs text-[hsl(var(--muted-foreground))]">
            <GitBranchIcon className="size-3" />
            {branch}
          </span>
        ) : null}
      </div>
      <div className="ml-auto flex items-center gap-2">{rightSlot}</div>
    </header>
  );
}

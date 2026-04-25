import { cn } from "@/shared/lib/cn";
import { useLastPullRequest } from "@/shared/stores/useLastPullRequest";
import { Button } from "@/shared/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import {
  FilesIcon,
  GitPullRequestIcon,
  LogOutIcon,
  type LucideIcon,
  MessageSquareIcon,
  SettingsIcon,
} from "lucide-react";
import { Link, useLocation, useMatch, useNavigate } from "react-router-dom";

interface RailItemProps {
  to: string;
  icon: LucideIcon;
  label: string;
  isActive?: boolean;
  disabled?: boolean;
}

function RailItem({ to, icon: Icon, label, isActive, disabled }: RailItemProps) {
  const className = cn(
    "size-9 rounded-md text-[hsl(var(--muted-foreground))]",
    isActive && "bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]",
    disabled && "pointer-events-none opacity-40",
  );
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button asChild variant="ghost" size="icon" className={className}>
          <Link
            to={to}
            aria-label={label}
            aria-disabled={disabled || undefined}
            tabIndex={disabled ? -1 : undefined}
          >
            <Icon className="size-4" />
          </Link>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

interface RailButtonProps {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}

function RailButton({ icon: Icon, label, onClick }: RailButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={label}
          onClick={onClick}
          className="size-9 rounded-md text-[hsl(var(--muted-foreground))]"
        >
          <Icon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

export function Rail() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const repoMatch = useMatch("/repo/:owner/:repo/*");
  const owner = repoMatch?.params.owner ?? "";
  const repo = repoMatch?.params.repo ?? "";
  const repoBase = repoMatch ? `/repo/${owner}/${repo}` : "/";
  const prMatch = pathname.match(/\/pulls\/(\d+)/);
  const lastPr = useLastPullRequest((s) => (repoMatch ? s.byRepo[`${owner}/${repo}`] : undefined));
  const activePrNumber = prMatch ? Number(prMatch[1]) : lastPr;
  const prBase = activePrNumber ? `${repoBase}/pulls/${activePrNumber}` : null;
  const onPrList = Boolean(repoMatch) && !prMatch;

  return (
    <nav
      aria-label="Primary"
      className="flex h-full w-12 shrink-0 flex-col items-center gap-2 border-r border-[hsl(var(--border))] bg-[hsl(var(--card))] py-3"
    >
      <RailItem
        to={prBase ?? repoBase}
        icon={FilesIcon}
        label="Changes"
        isActive={Boolean(prMatch)}
        disabled={!prBase}
      />
      <RailItem
        to={repoBase}
        icon={GitPullRequestIcon}
        label="Pull requests"
        isActive={onPrList}
        disabled={!repoMatch}
      />
      <RailItem
        to={prBase ?? repoBase}
        icon={MessageSquareIcon}
        label="Comments"
        disabled={!prBase}
      />
      <div className="mt-auto flex flex-col items-center gap-2">
        <RailButton icon={LogOutIcon} label="Leave repository" onClick={() => navigate("/")} />
        <RailItem to="/settings" icon={SettingsIcon} label="Settings (coming soon)" disabled />
      </div>
    </nav>
  );
}

import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import {
  GitPullRequestIcon,
  HomeIcon,
  type LucideIcon,
  MessageSquareIcon,
  SettingsIcon,
} from "lucide-react";
import { Link, useLocation, useMatch } from "react-router-dom";

interface RailItemProps {
  to: string;
  icon: LucideIcon;
  label: string;
  isActive?: boolean;
}

function RailItem({ to, icon: Icon, label, isActive }: RailItemProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          asChild
          variant="ghost"
          size="icon"
          className={cn(
            "size-9 rounded-md text-[hsl(var(--muted-foreground))]",
            isActive && "bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]",
          )}
        >
          <Link to={to} aria-label={label}>
            <Icon className="size-4" />
          </Link>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

export function Rail() {
  const { pathname } = useLocation();
  const repoMatch = useMatch("/repo/:owner/:repo/*");
  const repoBase = repoMatch ? `/repo/${repoMatch.params.owner}/${repoMatch.params.repo}` : "/";
  const inReview = pathname.includes("/pulls/");

  return (
    <nav
      aria-label="Primary"
      className="flex h-full w-12 shrink-0 flex-col items-center gap-2 border-r border-[hsl(var(--border))] bg-[hsl(var(--card))] py-3"
    >
      <RailItem to="/" icon={HomeIcon} label="Repositories" isActive={pathname === "/"} />
      <RailItem
        to={repoBase}
        icon={GitPullRequestIcon}
        label="Pull requests"
        isActive={Boolean(repoMatch) && !inReview}
      />
      <RailItem
        to={inReview ? pathname : repoBase}
        icon={MessageSquareIcon}
        label="Review"
        isActive={inReview}
      />
      <div className="mt-auto">
        <RailItem to="/settings" icon={SettingsIcon} label="Settings" />
      </div>
    </nav>
  );
}

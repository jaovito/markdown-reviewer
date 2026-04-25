import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import { HomeIcon, type LucideIcon, SettingsIcon } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

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
  return (
    <nav
      aria-label="Primary"
      className="flex h-full w-12 flex-col items-center gap-2 border-r border-[hsl(var(--border))] bg-[hsl(var(--card))] py-3"
    >
      <RailItem to="/" icon={HomeIcon} label="Repositories" isActive={pathname === "/"} />
      <div className="mt-auto">
        <RailItem to="/settings" icon={SettingsIcon} label="Settings" />
      </div>
    </nav>
  );
}

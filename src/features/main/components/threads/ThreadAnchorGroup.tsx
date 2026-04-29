import { cn } from "@/shared/lib/cn";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

interface ThreadAnchorGroupProps {
  /** Pre-formatted anchor label (e.g. `L4` or `L12–L18`). */
  anchorLabel: string;
  threadCount: number;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}

/**
 * Collapsible per-(line/range) group. The header shows the anchor label
 * (line or range) plus the count of threads attached at that anchor.
 */
export function ThreadAnchorGroup({
  anchorLabel,
  threadCount,
  expanded,
  onToggle,
  children,
}: ThreadAnchorGroupProps) {
  const { t } = useTranslation();
  const Chevron = expanded ? ChevronDownIcon : ChevronRightIcon;
  const ariaLabel = expanded
    ? t("main.threads.tree.collapseAnchorAria", { anchor: anchorLabel })
    : t("main.threads.tree.expandAnchorAria", { anchor: anchorLabel });
  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-label={ariaLabel}
        className={cn(
          "flex w-full items-center gap-1.5 rounded-md px-1.5 py-0.5 text-left text-[11px] transition-colors",
          "hover:bg-[hsl(var(--accent))]/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
        )}
      >
        <Chevron className="size-3 shrink-0 text-[hsl(var(--muted-foreground))]" />
        <span className="font-mono text-[11px] text-[hsl(var(--foreground))]">{anchorLabel}</span>
        <span className="shrink-0 text-[11px] text-[hsl(var(--muted-foreground))]">
          {t("main.threads.tree.anchorCount", { count: threadCount })}
        </span>
      </button>
      {expanded ? <div className="flex flex-col gap-2 pl-3">{children}</div> : null}
    </div>
  );
}

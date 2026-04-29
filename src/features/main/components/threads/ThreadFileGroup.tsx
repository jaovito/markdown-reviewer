import { cn } from "@/shared/lib/cn";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

interface ThreadFileGroupProps {
  filePath: string;
  threadCount: number;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}

/**
 * Collapsible per-file group. The header shows the file path plus the total
 * number of threads inside; clicking it toggles expansion.
 */
export function ThreadFileGroup({
  filePath,
  threadCount,
  expanded,
  onToggle,
  children,
}: ThreadFileGroupProps) {
  const { t } = useTranslation();
  const Chevron = expanded ? ChevronDownIcon : ChevronRightIcon;
  const ariaLabel = expanded
    ? t("main.threads.tree.collapseFileAria", { file: filePath })
    : t("main.threads.tree.expandFileAria", { file: filePath });
  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-label={ariaLabel}
        className={cn(
          "flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[12px] transition-colors",
          "hover:bg-[hsl(var(--accent))]/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
        )}
      >
        <Chevron className="size-3 shrink-0 text-[hsl(var(--muted-foreground))]" />
        <span className="min-w-0 flex-1 truncate font-medium text-[hsl(var(--foreground))]">
          {filePath}
        </span>
        <span className="shrink-0 text-[11px] text-[hsl(var(--muted-foreground))]">
          {t("main.threads.tree.fileCount", { count: threadCount })}
        </span>
      </button>
      {expanded ? <div className="flex flex-col gap-2 pl-3">{children}</div> : null}
    </div>
  );
}

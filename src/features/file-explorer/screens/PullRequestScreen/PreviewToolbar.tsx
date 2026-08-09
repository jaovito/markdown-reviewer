import { DocumentOutlinePopover } from "@/features/markdown-preview/components/DocumentOutlinePopover";
import type { HeadingItem } from "@/features/markdown-preview/lib/extractHeadings";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/shared/ui/tooltip";
import {
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
  SearchIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

interface PreviewToolbarProps {
  selectedPath?: string;
  prNumber?: number;
  headings?: HeadingItem[];
  onSelectHeading?: (line: number) => void;
  onOpenSearch?: () => void;
  isLeftCollapsed: boolean;
  onToggleLeft: () => void;
  isRightCollapsed: boolean;
  onToggleRight: () => void;
}

export function PreviewToolbar({
  selectedPath,
  prNumber,
  headings,
  onSelectHeading,
  onOpenSearch,
  isLeftCollapsed,
  onToggleLeft,
  isRightCollapsed,
  onToggleRight,
}: PreviewToolbarProps) {
  const { t } = useTranslation();

  return (
    <div className="flex w-full items-center justify-between gap-2">
      {/* Left section: Toggle left sidebar + file path */}
      <div className="flex min-w-0 items-center gap-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onToggleLeft}
                aria-label={t("fileExplorer.preview.toggleLeftSidebar")}
                className={`flex h-7 w-7 items-center justify-center rounded-md border text-xs transition-colors ${
                  isLeftCollapsed
                    ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]"
                    : "border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))]"
                }`}
              >
                {isLeftCollapsed ? (
                  <PanelLeftOpenIcon className="size-3.5" />
                ) : (
                  <PanelLeftCloseIcon className="size-3.5" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <span>{t("fileExplorer.preview.toggleLeftSidebar")}</span>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <span className="truncate text-xs text-[hsl(var(--muted-foreground))] font-medium">
          {selectedPath ?? t("fileExplorer.preview.fallbackToolbarLabel", { number: prNumber })}
        </span>
      </div>

      {/* Right section: Outline, Search, Toggle right sidebar */}
      <div className="flex shrink-0 items-center gap-1.5">
        {selectedPath && headings && onSelectHeading ? (
          <DocumentOutlinePopover headings={headings} onSelectHeading={onSelectHeading} />
        ) : null}

        {selectedPath && onOpenSearch ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onOpenSearch}
                  aria-label={t("fileExplorer.preview.searchAria")}
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-[hsl(var(--border))] text-xs text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))]"
                >
                  <SearchIcon className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <span>{t("fileExplorer.preview.searchAria")} (⌘F / Ctrl+F)</span>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null}

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onToggleRight}
                aria-label={t("fileExplorer.preview.toggleRightSidebar")}
                className={`flex h-7 w-7 items-center justify-center rounded-md border text-xs transition-colors ${
                  isRightCollapsed
                    ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]"
                    : "border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))]"
                }`}
              >
                {isRightCollapsed ? (
                  <PanelRightOpenIcon className="size-3.5" />
                ) : (
                  <PanelRightCloseIcon className="size-3.5" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <span>{t("fileExplorer.preview.toggleRightSidebar")}</span>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}

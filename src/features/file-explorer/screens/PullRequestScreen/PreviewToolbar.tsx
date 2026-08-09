import { DocumentOutlinePopover } from "@/features/markdown-preview/components/DocumentOutlinePopover";
import type { HeadingItem } from "@/features/markdown-preview/lib/extractHeadings";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/shared/ui/tooltip";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
  SearchIcon,
} from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

interface PreviewToolbarProps {
  owner?: string;
  repo?: string;
  selectedPath?: string;
  prNumber?: number;
  headSha?: string;
  headings?: HeadingItem[];
  onSelectHeading?: (line: number) => void;
  onOpenSearch?: () => void;
  isLeftCollapsed: boolean;
  onToggleLeft: () => void;
  isRightCollapsed: boolean;
  onToggleRight: () => void;
}

export function PreviewToolbar({
  owner,
  repo,
  selectedPath,
  prNumber,
  headSha,
  headings,
  onSelectHeading,
  onOpenSearch,
  isLeftCollapsed,
  onToggleLeft,
  isRightCollapsed,
  onToggleRight,
}: PreviewToolbarProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const fileUrl =
    owner && repo && selectedPath
      ? `https://github.com/${owner}/${repo}/blob/${headSha ?? "main"}/${selectedPath}`
      : undefined;

  const handleCopyLink = useCallback(async () => {
    if (!fileUrl) return;
    try {
      await navigator.clipboard.writeText(fileUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback if clipboard fails
    }
  }, [fileUrl]);

  return (
    <div className="flex w-full items-center justify-between gap-2">
      {/* Left section: Toggle left sidebar + file path link & copy button */}
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

        {selectedPath ? (
          <div className="flex min-w-0 items-center gap-1.5">
            {fileUrl ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => openUrl(fileUrl).catch(() => undefined)}
                      className="group flex min-w-0 items-center gap-1 text-xs font-medium text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))] hover:underline cursor-pointer"
                    >
                      <span className="truncate">{selectedPath}</span>
                      <ExternalLinkIcon className="size-3 shrink-0 opacity-60 transition-opacity group-hover:opacity-100" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <span>{t("fileExplorer.preview.openFileOnGithub")}</span>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <span className="truncate text-xs font-medium text-[hsl(var(--muted-foreground))]">
                {selectedPath}
              </span>
            )}

            {fileUrl ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={handleCopyLink}
                      aria-label={t("fileExplorer.preview.copyFileLink")}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))] cursor-pointer"
                    >
                      {copied ? (
                        <CheckIcon className="size-3.5 text-emerald-500" />
                      ) : (
                        <CopyIcon className="size-3.5" />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <span>
                      {copied
                        ? t("fileExplorer.preview.copied")
                        : t("fileExplorer.preview.copyFileLink")}
                    </span>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : null}
          </div>
        ) : (
          <span className="truncate text-xs font-medium text-[hsl(var(--muted-foreground))]">
            {t("fileExplorer.preview.fallbackToolbarLabel", { number: prNumber })}
          </span>
        )}
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

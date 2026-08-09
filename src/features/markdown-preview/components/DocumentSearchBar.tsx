import { Input } from "@/shared/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/shared/ui/tooltip";
import { ChevronDownIcon, ChevronUpIcon, XIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

interface DocumentSearchBarProps {
  isOpen: boolean;
  query: string;
  onQueryChange: (q: string) => void;
  isCaseSensitive: boolean;
  onToggleCaseSensitive: () => void;
  currentIndex: number;
  matchCount: number;
  onNextMatch: () => void;
  onPrevMatch: () => void;
  onClose: () => void;
}

export function DocumentSearchBar({
  isOpen,
  query,
  onQueryChange,
  isCaseSensitive,
  onToggleCaseSensitive,
  currentIndex,
  matchCount,
  onNextMatch,
  onPrevMatch,
  onClose,
}: DocumentSearchBarProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) {
        onPrevMatch();
      } else {
        onNextMatch();
      }
    }
  };

  return (
    <div className="absolute right-6 top-3 z-40 flex items-center gap-1.5 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] p-1.5 shadow-2xl animate-in fade-in-50 slide-in-from-top-2">
      <Input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t("fileExplorer.preview.searchPlaceholder")}
        className="h-7 w-48 border-none bg-transparent px-2 text-xs focus-visible:ring-0"
      />

      <TooltipProvider>
        {/* Case sensitivity (aA) button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onToggleCaseSensitive}
              aria-pressed={isCaseSensitive}
              aria-label={t("fileExplorer.preview.matchCase")}
              className={`flex h-6 w-6 items-center justify-center rounded text-[11px] font-semibold transition-colors ${
                isCaseSensitive
                  ? "border border-[hsl(var(--foreground))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))]"
                  : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))]"
              }`}
            >
              aA
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <span>{t("fileExplorer.preview.matchCase")}</span>
          </TooltipContent>
        </Tooltip>

        {/* Counter label */}
        <div className="min-w-16 px-1 text-center text-[11px] text-[hsl(var(--muted-foreground))] select-none">
          {query.trim()
            ? matchCount > 0
              ? t("fileExplorer.preview.matchCount", {
                  current: currentIndex + 1,
                  total: matchCount,
                })
              : t("fileExplorer.preview.noResults")
            : null}
        </div>

        {/* Previous match */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onPrevMatch}
              disabled={matchCount === 0}
              aria-label={t("fileExplorer.preview.previousMatch")}
              className="flex h-6 w-6 items-center justify-center rounded text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))] disabled:opacity-40"
            >
              <ChevronUpIcon className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <span>{t("fileExplorer.preview.previousMatch")}</span>
          </TooltipContent>
        </Tooltip>

        {/* Next match */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onNextMatch}
              disabled={matchCount === 0}
              aria-label={t("fileExplorer.preview.nextMatch")}
              className="flex h-6 w-6 items-center justify-center rounded text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))] disabled:opacity-40"
            >
              <ChevronDownIcon className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <span>{t("fileExplorer.preview.nextMatch")}</span>
          </TooltipContent>
        </Tooltip>

        {/* Close search bar */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("fileExplorer.preview.closeSearch")}
              className="flex h-6 w-6 items-center justify-center rounded text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))]"
            >
              <XIcon className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <span>{t("fileExplorer.preview.closeSearch")}</span>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

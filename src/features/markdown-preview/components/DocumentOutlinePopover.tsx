import { Input } from "@/shared/ui/input";
import { ScrollArea } from "@/shared/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/shared/ui/tooltip";
import { ListFilterIcon, ListTreeIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { HeadingItem } from "../lib/extractHeadings";

interface DocumentOutlinePopoverProps {
  headings: HeadingItem[];
  onSelectHeading: (line: number) => void;
}

export function DocumentOutlinePopover({ headings, onSelectHeading }: DocumentOutlinePopoverProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [filterQuery, setFilterQuery] = useState("");
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredHeadings = useMemo(() => {
    if (!filterQuery.trim()) return headings;
    const q = filterQuery.toLowerCase();
    return headings.filter((h) => h.text.toLowerCase().includes(q));
  }, [headings, filterQuery]);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setFilterQuery("");
    }
  }, [isOpen]);

  const levelIndentClass = (level: number) => {
    switch (level) {
      case 1:
        return "pl-3 font-semibold";
      case 2:
        return "pl-6";
      case 3:
        return "pl-9 text-[11px]";
      case 4:
        return "pl-12 text-[11px]";
      default:
        return "pl-14 text-[11px]";
    }
  };

  return (
    <div className="relative" ref={popoverRef}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setIsOpen((prev) => !prev)}
              aria-expanded={isOpen}
              aria-label={t("fileExplorer.preview.tableOfContents")}
              className={`flex h-7 w-7 items-center justify-center rounded-md border text-xs font-medium transition-colors ${
                isOpen
                  ? "border-[hsl(var(--foreground))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))]"
                  : "border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))]"
              }`}
            >
              <ListTreeIcon className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <span>{t("fileExplorer.preview.tableOfContents")}</span>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {isOpen ? (
        <div className="absolute right-0 top-full z-50 mt-1.5 flex max-h-[420px] w-80 flex-col rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] shadow-2xl animate-in fade-in-50 zoom-in-95">
          <div className="flex items-center gap-2 border-b border-[hsl(var(--border))] p-2">
            <ListFilterIcon className="size-3.5 shrink-0 text-[hsl(var(--muted-foreground))]" />
            <Input
              ref={inputRef}
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder={t("fileExplorer.preview.filterHeadings")}
              className="h-7 border-none bg-transparent p-0 text-xs focus-visible:ring-0"
            />
          </div>
          <ScrollArea className="flex-1 p-1">
            {headings.length === 0 ? (
              <div className="p-4 text-center text-xs text-[hsl(var(--muted-foreground))]">
                {t("fileExplorer.preview.noHeadingsInDoc")}
              </div>
            ) : filteredHeadings.length === 0 ? (
              <div className="p-4 text-center text-xs text-[hsl(var(--muted-foreground))]">
                {t("fileExplorer.preview.noHeadingsFound")}
              </div>
            ) : (
              <div className="flex flex-col gap-0.5 py-1">
                {filteredHeadings.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => {
                      onSelectHeading(h.line);
                      setIsOpen(false);
                    }}
                    className={`group flex w-full items-center py-1.5 pr-2.5 text-left text-xs transition-colors rounded-md hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--accent-foreground))] ${levelIndentClass(
                      h.level,
                    )}`}
                  >
                    <span className="truncate">{h.text}</span>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      ) : null}
    </div>
  );
}

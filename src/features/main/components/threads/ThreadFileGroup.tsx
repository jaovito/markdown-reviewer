import { cn } from "@/shared/lib/cn";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { type ReactNode, forwardRef } from "react";
import { useTranslation } from "react-i18next";

interface ThreadFileGroupProps {
  filePath: string;
  /** Total number of threads (comments grouped by anchor) inside this file. */
  threadCount: number;
  expanded: boolean;
  onToggle: () => void;
  /**
   * Tab order for the header — `0` only when this header is the roving
   * focus target inside the tree, otherwise `-1`. Owned by `ThreadList`.
   */
  tabIndex: number;
  onFocus?: () => void;
  children: ReactNode;
}

/**
 * Collapsible per-file group. The header is a `role="treeitem"` button (with
 * `aria-expanded`); children are wrapped in a `role="group"` container so
 * screen readers announce them as nested under the file.
 */
export const ThreadFileGroup = forwardRef<HTMLButtonElement, ThreadFileGroupProps>(
  function ThreadFileGroup(
    { filePath, threadCount, expanded, onToggle, tabIndex, onFocus, children },
    ref,
  ) {
    const { t } = useTranslation();
    const Chevron = expanded ? ChevronDownIcon : ChevronRightIcon;
    return (
      // The wrapper carries `role="presentation"` so it doesn't appear
      // between the parent `tree`/`group` and the `treeitem` button in the
      // accessibility tree.
      <div role="presentation" className="flex flex-col gap-1.5">
        {/* biome-ignore lint/a11y/noInteractiveElementToNoninteractiveRole: WAI-ARIA tree pattern uses role="treeitem" on the focusable header element; the button still triggers expand/collapse semantics. */}
        <button
          ref={ref}
          type="button"
          role="treeitem"
          aria-expanded={expanded}
          tabIndex={tabIndex}
          onClick={onToggle}
          onFocus={onFocus}
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
        {expanded ? (
          // biome-ignore lint/a11y/useSemanticElements: WAI-ARIA tree groups are role="group" on a generic container; <fieldset> is for form controls only.
          <div role="group" className="flex flex-col gap-2 pl-3">
            {children}
          </div>
        ) : null}
      </div>
    );
  },
);

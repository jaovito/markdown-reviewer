import type { CommentState } from "@/shared/ipc/contract";
import { cn } from "@/shared/lib/cn";
import { useTranslation } from "react-i18next";

export type FilterableState = Exclude<CommentState, "deleted">;

interface ThreadFilterBarProps {
  enabled: Record<FilterableState, boolean>;
  onToggle: (state: FilterableState) => void;
}

const ORDER: FilterableState[] = ["draft", "submitted", "resolved", "hidden"];

export function ThreadFilterBar({ enabled, onToggle }: ThreadFilterBarProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] text-[hsl(var(--muted-foreground))]">
        {t("threads.filter.label")}
      </span>
      {ORDER.map((state) => {
        const active = enabled[state];
        return (
          <button
            key={state}
            type="button"
            onClick={() => onToggle(state)}
            aria-pressed={active}
            className={cn(
              "inline-flex h-6 items-center rounded-full border px-2.5 text-[11px] font-medium transition-colors",
              active
                ? "border-[hsl(var(--foreground))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))]"
                : "border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]",
            )}
          >
            {t(`threads.filter.${state}`)}
          </button>
        );
      })}
    </div>
  );
}

import type { ChangeStatus } from "@/shared/ipc/contract";
import { cn } from "@/shared/lib/cn";

const STATUS_LABEL: Record<ChangeStatus, string> = {
  added: "A",
  modified: "M",
  deleted: "D",
  renamed: "R",
  copied: "C",
  changed: "M",
  unchanged: "·",
};

const STATUS_TONE: Record<ChangeStatus, string> = {
  added: "text-emerald-600 dark:text-emerald-400",
  modified: "text-amber-600 dark:text-amber-400",
  changed: "text-amber-600 dark:text-amber-400",
  deleted: "text-[hsl(var(--destructive))]",
  renamed: "text-sky-600 dark:text-sky-400",
  copied: "text-sky-600 dark:text-sky-400",
  unchanged: "text-[hsl(var(--muted-foreground))]",
};

export function ChangeStatusDot({ status }: { status: ChangeStatus }) {
  return (
    <span
      aria-label={`change status: ${status}`}
      className={cn(
        "inline-flex w-3 shrink-0 justify-center font-mono text-[10px] font-semibold",
        STATUS_TONE[status],
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

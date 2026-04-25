import type { ChangeStatus } from "@/shared/ipc/contract";
import { cn } from "@/shared/lib/cn";
import { useTranslation } from "react-i18next";

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

const STATUS_NAME_KEY = {
  added: "fileExplorer.status.added",
  modified: "fileExplorer.status.modified",
  deleted: "fileExplorer.status.deleted",
  renamed: "fileExplorer.status.renamed",
  copied: "fileExplorer.status.copied",
  changed: "fileExplorer.status.changed",
  unchanged: "fileExplorer.status.unchanged",
} as const satisfies Record<ChangeStatus, string>;

export function ChangeStatusDot({ status }: { status: ChangeStatus }) {
  const { t } = useTranslation();
  const statusName = t(STATUS_NAME_KEY[status]);

  return (
    <span
      aria-label={t("fileExplorer.status.aria", { status: statusName })}
      className={cn(
        "inline-flex w-3 shrink-0 justify-center font-mono text-[10px] font-semibold",
        STATUS_TONE[status],
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

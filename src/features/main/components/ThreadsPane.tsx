import { ScrollArea } from "@/shared/ui/scroll-area";
import { MessagesSquareIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

export function ThreadsPane() {
  const { t } = useTranslation();
  return (
    <aside className="flex h-full w-[336px] shrink-0 flex-col border-l border-[hsl(var(--border))] bg-[hsl(var(--card))]">
      <div className="flex flex-col gap-1 px-4 pb-3 pt-4">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
          {t("main.threads.title")}
        </span>
        <span className="text-xs text-[hsl(var(--muted-foreground))]">
          {t("main.threads.subtitle")}
        </span>
      </div>
      <ScrollArea className="flex-1">
        <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-xs text-[hsl(var(--muted-foreground))]">
          <MessagesSquareIcon className="size-6 opacity-60" />
          <p>{t("main.threads.phase3Hint")}</p>
        </div>
      </ScrollArea>
    </aside>
  );
}

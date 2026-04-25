import { useTranslation } from "react-i18next";

export function EmptyState({ hasQuery }: { hasQuery: boolean }) {
  const { t } = useTranslation();
  return (
    <li className="rounded-md border border-dashed border-[hsl(var(--border))] px-4 py-10 text-center text-sm text-[hsl(var(--muted-foreground))]">
      {hasQuery ? t("pullRequests.list.emptyFiltered") : t("pullRequests.list.emptyAll")}
    </li>
  );
}

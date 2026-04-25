import { useTranslation } from "react-i18next";

export function NotFound() {
  const { t } = useTranslation();
  return (
    <main className="mx-auto flex min-h-full w-full max-w-xl flex-col gap-2 p-8">
      <h1 className="text-2xl font-semibold">{t("app.states.notFoundTitle")}</h1>
      <p className="text-sm text-[hsl(var(--muted-foreground))]">
        {t("app.states.notFoundDescription")}
      </p>
    </main>
  );
}

import { PullRequestPage } from "@/features/file-explorer";
import { MainLayout } from "@/features/main";
import { SelectRepoRoute } from "@/features/onboarding";
import { PullRequestListPage } from "@/features/pull-requests";
import { useTranslation } from "react-i18next";
import { Route, Routes } from "react-router-dom";

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<SelectRepoRoute />} />
      <Route path="/repo/:owner/:repo" element={<MainLayout />}>
        <Route index element={<PullRequestListPage />} />
        <Route path="pulls/:number" element={<PullRequestPage />} />
        <Route path="pulls/:number/files/*" element={<PullRequestPage />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

function NotFound() {
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

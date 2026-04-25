import { MainLayout } from "@/features/main";
import { SelectRepoRoute } from "@/features/onboarding";
import { PullRequestListPage } from "@/features/pull-requests";
import { Route, Routes } from "react-router-dom";

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<SelectRepoRoute />} />
      <Route path="/repo/:owner/:repo" element={<MainLayout />}>
        <Route index element={<PullRequestListPage />} />
        <Route path="pulls/:number" element={<PullRequestPagePlaceholder />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

function PullRequestPagePlaceholder() {
  return (
    <main className="mx-auto flex h-full w-full max-w-xl flex-col items-center justify-center gap-2 p-8 text-center">
      <h2 className="text-lg font-semibold">Pull request detail</h2>
      <p className="text-sm text-[hsl(var(--muted-foreground))]">
        The file tree and preview land here once issues #9 and #11 are wired up.
      </p>
    </main>
  );
}

function NotFound() {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-xl flex-col gap-2 p-8">
      <h1 className="text-2xl font-semibold">Not found</h1>
      <p className="text-sm text-[hsl(var(--muted-foreground))]">
        The screen you tried to open doesn't exist.
      </p>
    </main>
  );
}

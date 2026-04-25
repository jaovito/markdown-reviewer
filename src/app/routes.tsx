import { MainLayout } from "@/features/main";
import { RepoHomePlaceholder } from "@/features/main/routes/RepoHomePlaceholder";
import { SelectRepoRoute } from "@/features/onboarding";
import { Route, Routes } from "react-router-dom";

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<SelectRepoRoute />} />
      <Route path="/repo/:owner/:repo" element={<MainLayout />}>
        <Route index element={<RepoHomePlaceholder />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
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

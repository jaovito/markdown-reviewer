import { PullRequestScreen } from "@/features/file-explorer";
import { MainLayout } from "@/features/main";
import { SelectRepoScreen } from "@/features/onboarding";
import { PullRequestListScreen } from "@/features/pull-requests";
import { Route, Routes } from "react-router-dom";
import { NotFound } from "./NotFound";

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<SelectRepoScreen />} />
      <Route path="/repo/:owner/:repo" element={<MainLayout />}>
        <Route index element={<PullRequestListScreen />} />
        <Route path="pulls/:number" element={<PullRequestScreen />} />
        <Route path="pulls/:number/files/*" element={<PullRequestScreen />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

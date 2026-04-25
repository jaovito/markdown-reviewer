import { SidebarShell } from "../components/SidebarShell";
import { MainShell } from "./MainLayout";

/**
 * Default landing page inside `MainLayout` until #8 wires the real PR list.
 * Replaced once `features/pull-requests/PullRequestListPage` lands.
 */
export function RepoHomePlaceholder() {
  return (
    <MainShell
      sidebar={
        <SidebarShell
          title="Pull requests"
          emptyHint="The pull request list lands here once issue #8 is wired up."
        />
      }
      previewEmptyHint="Select a pull request from the sidebar to start reviewing Markdown files."
    />
  );
}

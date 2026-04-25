use markdown_reviewer_core::application::files::Files;
use markdown_reviewer_core::application::pull_requests::PullRequests;
use markdown_reviewer_core::application::repo_selection::RepoSelection;

/// Tauri managed state. Clone-on-access: every member is `Arc`-wrapped inside
/// the use-case bundles, so cloning is cheap.
#[derive(Clone)]
pub struct AppState {
    pub repo_selection: RepoSelection,
    pub pull_requests: PullRequests,
    pub files: Files,
}

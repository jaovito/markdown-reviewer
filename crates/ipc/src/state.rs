use markdown_reviewer_core::application::repo_selection::RepoSelection;

/// Tauri managed state. Clone-on-access: all members are `Arc`-wrapped inside
/// `RepoSelection`, so cloning is cheap.
#[derive(Clone)]
pub struct AppState {
    pub repo_selection: RepoSelection,
}

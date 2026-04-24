use async_trait::async_trait;

use crate::AppResult;

/// Abstracts the local `git` binary. Only structured calls allowed.
#[async_trait]
pub trait GitClient: Send + Sync {
    /// Returns `git --version` output (trimmed). Used to check availability.
    async fn version(&self) -> AppResult<String>;

    /// Returns `Ok(true)` if `<path>` is inside a Git working tree.
    async fn is_git_repo(&self, path: &str) -> AppResult<bool>;

    /// Returns the `origin` remote URL, if any.
    async fn remote_origin_url(&self, path: &str) -> AppResult<Option<String>>;

    /// Returns the currently checked-out branch name (None if detached HEAD).
    async fn current_branch(&self, path: &str) -> AppResult<Option<String>>;
}

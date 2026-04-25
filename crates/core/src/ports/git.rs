use async_trait::async_trait;

use crate::domain::DiffHunk;
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

    /// Returns the contents of `<file_path>` at `<sha>`, equivalent to
    /// `git show <sha>:<file_path>`. Returns `None` when either the ref or
    /// the file at that ref is missing locally; callers can fall back to a
    /// remote fetch.
    async fn show_file(
        &self,
        repo_path: &str,
        sha: &str,
        file_path: &str,
    ) -> AppResult<Option<String>>;

    /// Returns the head-side hunks for `<file_path>` between `<base>` and
    /// `<head>` (inclusive line ranges, 1-based). Returns `None` when one of
    /// the refs is missing locally.
    async fn diff_hunks(
        &self,
        repo_path: &str,
        base: &str,
        head: &str,
        file_path: &str,
    ) -> AppResult<Option<Vec<DiffHunk>>>;
}

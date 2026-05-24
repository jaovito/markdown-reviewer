//! Production `FileResolver`. Tries the local clone first (via `git show`);
//! falls back to `gh api contents` when the ref isn't in the working tree.

use std::sync::Arc;

use async_trait::async_trait;
use markdown_reviewer_core::ports::{FileResolver, GhClient, GitClient};
use markdown_reviewer_core::{AppError, AppResult};

pub struct GitWithGhFallback {
    pub git: Arc<dyn GitClient>,
    pub gh: Arc<dyn GhClient>,
}

#[async_trait]
impl FileResolver for GitWithGhFallback {
    async fn read(&self, repo_path: &str, sha: &str, path: &str) -> AppResult<String> {
        match self.git.show_file(repo_path, sha, path).await {
            Ok(Some(text)) => Ok(text),
            // Local clone doesn't have the ref or file — fall back to the GitHub API.
            Ok(None) => self.gh.get_file_content(repo_path, sha, path).await,
            Err(AppError::FileNotFound { .. }) | Err(AppError::Process { .. }) => {
                self.gh.get_file_content(repo_path, sha, path).await
            }
            Err(other) => Err(other),
        }
    }
}

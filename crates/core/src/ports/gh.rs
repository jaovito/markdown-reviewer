use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use crate::domain::{ChangedFile, PullRequestDetail, PullRequestSummary};
use crate::AppResult;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GhAuthReport {
    pub authenticated: bool,
    pub username: Option<String>,
    pub detail: String,
}

/// Abstracts the GitHub CLI (`gh`).
#[async_trait]
pub trait GhClient: Send + Sync {
    async fn version(&self) -> AppResult<String>;
    async fn auth_status(&self) -> AppResult<GhAuthReport>;
    async fn list_pull_requests(&self, repo_path: &str) -> AppResult<Vec<PullRequestSummary>>;
    async fn load_pull_request(&self, repo_path: &str, number: u64)
        -> AppResult<PullRequestDetail>;
    async fn list_changed_files(&self, repo_path: &str, number: u64)
        -> AppResult<Vec<ChangedFile>>;
    /// Fetches the contents of `<file_path>` at `<sha>` from the GitHub
    /// remote. Used as a fallback when the ref isn't in the local clone.
    /// Returns `Err(AppError::FileNotFound { sha, path })` when the file
    /// doesn't exist at that ref.
    async fn get_file_content(
        &self,
        repo_path: &str,
        sha: &str,
        file_path: &str,
    ) -> AppResult<String>;
}

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
}

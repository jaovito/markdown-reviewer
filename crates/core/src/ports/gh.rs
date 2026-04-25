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

/// One inline review comment to submit. Lines refer to positions in the file
/// at `head_sha`; we always anchor to a single line on the RIGHT side because
/// GitHub's per-comment endpoint requires it (range comments live on the
/// review-batch endpoint via `start_line`).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewCommentInput {
    pub local_id: i64,
    pub path: String,
    pub line: u32,
    pub body: String,
}

/// Per-comment status returned to the UI after a `submit_review` round-trip.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmittedReviewComment {
    pub local_id: i64,
    pub github_id: Option<i64>,
    pub submitted: bool,
    pub error: Option<String>,
}

/// Aggregate result of a `submit_review` round-trip.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewSubmissionResult {
    pub comments: Vec<SubmittedReviewComment>,
    pub all_submitted: bool,
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

    /// Posts a review with multiple inline comments via
    /// `POST /repos/{owner}/{repo}/pulls/{number}/reviews` with
    /// `event: COMMENT`. Returns the created GitHub comment ids in the same
    /// order as `comments`, or `Err` if the entire batch failed (caller can
    /// then fall back to per-comment submission).
    async fn submit_review_batch(
        &self,
        repo_path: &str,
        pr_number: u64,
        head_sha: &str,
        comments: &[ReviewCommentInput],
    ) -> AppResult<Vec<i64>>;

    /// Posts a single review comment via
    /// `POST /repos/{owner}/{repo}/pulls/{number}/comments`. Used as the
    /// fallback when the batch endpoint rejects part or all of the request.
    async fn submit_review_comment(
        &self,
        repo_path: &str,
        pr_number: u64,
        head_sha: &str,
        comment: &ReviewCommentInput,
    ) -> AppResult<i64>;
}

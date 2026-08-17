use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use crate::domain::{
    ChangedFile, PullRequestDetail, PullRequestSummary, RemoteComment, RemoteRepository,
    RemoteThread,
};
use crate::AppResult;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GhAuthReport {
    pub authenticated: bool,
    pub username: Option<String>,
    pub detail: String,
}

/// One inline review comment to submit. Lines refer to positions in the file
/// at `head_sha`. `line` is the final line of the anchor (single-line or end
/// of a range); when `start_line` is present the comment becomes multi-line
/// on the GitHub side (`POST /pulls/{n}/comments` and the review-batch
/// `comments[i][start_line]` payload both honor it).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewCommentInput {
    pub local_id: i64,
    pub path: String,
    pub line: u32,
    /// Set to `Some(start)` when the original anchor spans multiple lines.
    /// Unused for single-line anchors.
    #[serde(default)]
    pub start_line: Option<u32>,
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

/// Raw GraphQL payload as returned by the adapter. The mapping use case is
/// the only consumer; `truncated` lets the UI surface a banner when we
/// stopped at the first page.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchedReviewThreads {
    pub threads: Vec<RemoteThread>,
    pub truncated: bool,
}

/// Abstracts the GitHub CLI (`gh`).
#[async_trait]
pub trait GhClient: Send + Sync {
    async fn version(&self) -> AppResult<String>;
    async fn auth_status(&self) -> AppResult<GhAuthReport>;
    async fn auth_login(&self) -> AppResult<GhAuthReport> {
        self.auth_status().await
    }
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

    /// Byte-preserving sibling of `get_file_content`, for binary blobs.
    async fn get_file_bytes(
        &self,
        repo_path: &str,
        sha: &str,
        file_path: &str,
    ) -> AppResult<Vec<u8>>;

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

    /// Fetches every review thread on a PR via the GraphQL endpoint
    /// `repository.pullRequest.reviewThreads(first: 100)`. Includes the
    /// thread node id (for resolve/unresolve), `isResolved`, `isOutdated`,
    /// and every comment's `viewerCan*` flags. Truncation past 100 threads
    /// is logged inside the adapter and surfaced via `truncated == true`.
    async fn list_review_threads(
        &self,
        repo_path: &str,
        pr_number: u64,
    ) -> AppResult<FetchedReviewThreads>;

    /// Posts a reply to an existing review thread via REST
    /// `POST /repos/{owner}/{repo}/pulls/{n}/comments` with `in_reply_to`.
    /// Returns the freshly-created `RemoteComment`.
    async fn reply_review_comment(
        &self,
        repo_path: &str,
        pr_number: u64,
        in_reply_to_comment_id: i64,
        body: &str,
    ) -> AppResult<RemoteComment>;

    /// `PATCH /repos/{owner}/{repo}/pulls/comments/{id}`.
    async fn edit_review_comment(
        &self,
        repo_path: &str,
        comment_id: i64,
        body: &str,
    ) -> AppResult<RemoteComment>;

    /// `DELETE /repos/{owner}/{repo}/pulls/comments/{id}` — 204 on success.
    async fn delete_review_comment(&self, repo_path: &str, comment_id: i64) -> AppResult<()>;

    /// GraphQL `resolveReviewThread(threadId: <node id>)`. Returns the
    /// updated thread (refetched via `list_review_threads_by_id`).
    async fn resolve_review_thread(
        &self,
        repo_path: &str,
        thread_id: &str,
    ) -> AppResult<RemoteThread>;

    /// GraphQL `unresolveReviewThread(threadId: <node id>)`.
    async fn unresolve_review_thread(
        &self,
        repo_path: &str,
        thread_id: &str,
    ) -> AppResult<RemoteThread>;

    /// Lists repositories accessible to the authenticated user via `gh repo list`.
    async fn list_user_repositories(
        &self,
        _query: Option<&str>,
        _limit: u32,
    ) -> AppResult<Vec<RemoteRepository>> {
        Ok(Vec::new())
    }

    /// Clones a repository via `gh repo clone <repo_name_with_owner> <target_dir>`.
    async fn clone_repository(
        &self,
        _repo_name_with_owner: &str,
        _target_dir: &str,
    ) -> AppResult<()> {
        Ok(())
    }
}

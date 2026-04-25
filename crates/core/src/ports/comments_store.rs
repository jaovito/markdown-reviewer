use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use crate::domain::{CommentAnchor, CommentUpdate, ReviewComment};
use crate::AppResult;

/// Payload accepted by `CommentsStore::create`. The store assigns `id`,
/// `created_at`, and `updated_at`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewComment {
    pub pr_number: u64,
    pub file_path: String,
    pub head_sha: String,
    pub body: String,
    pub author: Option<String>,
    pub anchor: CommentAnchor,
}

/// Patch the store applies after a successful submit to a remote.
/// Used by `submit_review` to flip drafts into `submitted` and stamp
/// the GitHub id.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmitOutcome {
    pub github_id: Option<i64>,
    pub submit_error: Option<String>,
}

#[async_trait]
pub trait CommentsStore: Send + Sync {
    /// Lists every comment for a PR ordered by `(file_path, start_line, id)`.
    /// Used by app-boot hydration (issue #18).
    async fn list_for_pr(&self, pr_number: u64) -> AppResult<Vec<ReviewComment>>;

    /// Lists every comment anchored to a single file inside a PR.
    async fn list_for_file(
        &self,
        pr_number: u64,
        file_path: &str,
    ) -> AppResult<Vec<ReviewComment>>;

    /// Returns the comment with the given local id, or `None` if absent.
    async fn get(&self, id: i64) -> AppResult<Option<ReviewComment>>;

    /// Persists a fresh draft. Returns the inserted row including the
    /// store-assigned id and timestamps.
    async fn create(&self, new: NewComment, now_unix_ms: i64) -> AppResult<ReviewComment>;

    /// Applies a patch. Returns the updated row.
    async fn update(
        &self,
        id: i64,
        patch: CommentUpdate,
        now_unix_ms: i64,
    ) -> AppResult<ReviewComment>;

    /// Soft-deletes by transitioning state → `Deleted`. Idempotent.
    async fn delete(&self, id: i64, now_unix_ms: i64) -> AppResult<()>;

    /// Marks a comment as submitted (or records the failure note). Used by
    /// `submit_review` after a remote round-trip.
    async fn record_submit(
        &self,
        id: i64,
        outcome: SubmitOutcome,
        now_unix_ms: i64,
    ) -> AppResult<ReviewComment>;
}

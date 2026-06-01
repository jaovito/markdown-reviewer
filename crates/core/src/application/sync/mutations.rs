//! Reply / edit / delete / resolve / reopen use cases. Each one is a thin
//! delegation to the `GhClient` port; the only logic here is choosing
//! between the resolve and unresolve mutations.

use crate::domain::{RemoteComment, RemoteThread};
use crate::AppResult;

use super::Sync;

pub async fn reply(
    svc: &Sync,
    repo_path: &str,
    pr_number: u64,
    in_reply_to_comment_id: i64,
    body: &str,
) -> AppResult<RemoteComment> {
    svc.gh
        .reply_review_comment(repo_path, pr_number, in_reply_to_comment_id, body)
        .await
}

pub async fn edit(
    svc: &Sync,
    repo_path: &str,
    comment_id: i64,
    body: &str,
) -> AppResult<RemoteComment> {
    svc.gh
        .edit_review_comment(repo_path, comment_id, body)
        .await
}

pub async fn delete(svc: &Sync, repo_path: &str, comment_id: i64) -> AppResult<()> {
    svc.gh.delete_review_comment(repo_path, comment_id).await
}

pub async fn resolve(svc: &Sync, repo_path: &str, thread_id: &str) -> AppResult<RemoteThread> {
    svc.gh.resolve_review_thread(repo_path, thread_id).await
}

pub async fn reopen(svc: &Sync, repo_path: &str, thread_id: &str) -> AppResult<RemoteThread> {
    svc.gh.unresolve_review_thread(repo_path, thread_id).await
}

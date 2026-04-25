use crate::domain::{CommentUpdate, ReviewComment};
use crate::ports::NewComment;
use crate::AppResult;

use super::Comments;

pub async fn list_for_pr(svc: &Comments, pr_number: u64) -> AppResult<Vec<ReviewComment>> {
    svc.store.list_for_pr(pr_number).await
}

pub async fn list_for_file(
    svc: &Comments,
    pr_number: u64,
    file_path: &str,
) -> AppResult<Vec<ReviewComment>> {
    svc.store.list_for_file(pr_number, file_path).await
}

pub async fn create(svc: &Comments, payload: NewComment) -> AppResult<ReviewComment> {
    svc.store.create(payload, svc.clock.now_unix_ms()).await
}

pub async fn update(
    svc: &Comments,
    id: i64,
    patch: CommentUpdate,
) -> AppResult<ReviewComment> {
    svc.store.update(id, patch, svc.clock.now_unix_ms()).await
}

pub async fn delete(svc: &Comments, id: i64) -> AppResult<()> {
    svc.store.delete(id, svc.clock.now_unix_ms()).await
}

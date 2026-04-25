use markdown_reviewer_core::application::comments::{crud, submit};
use markdown_reviewer_core::domain::{CommentAnchor, CommentUpdate, ReviewComment};
use markdown_reviewer_core::ports::{NewComment, ReviewSubmissionResult};
use markdown_reviewer_core::AppError;
use tauri::State;

use crate::state::AppState;

#[tauri::command(rename_all = "camelCase")]
pub async fn list_local_comments(
    state: State<'_, AppState>,
    pr_number: u64,
) -> Result<Vec<ReviewComment>, AppError> {
    crud::list_for_pr(&state.comments, pr_number).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn list_local_comments_for_file(
    state: State<'_, AppState>,
    pr_number: u64,
    file_path: String,
) -> Result<Vec<ReviewComment>, AppError> {
    crud::list_for_file(&state.comments, pr_number, &file_path).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn create_local_comment(
    state: State<'_, AppState>,
    pr_number: u64,
    file_path: String,
    head_sha: String,
    body: String,
    author: Option<String>,
    anchor: CommentAnchor,
) -> Result<ReviewComment, AppError> {
    crud::create(
        &state.comments,
        NewComment {
            pr_number,
            file_path,
            head_sha,
            body,
            author,
            anchor,
        },
    )
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn update_local_comment(
    state: State<'_, AppState>,
    id: i64,
    patch: CommentUpdate,
) -> Result<ReviewComment, AppError> {
    crud::update(&state.comments, id, patch).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn delete_local_comment(state: State<'_, AppState>, id: i64) -> Result<(), AppError> {
    crud::delete(&state.comments, id).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn submit_review(
    state: State<'_, AppState>,
    repo_path: String,
    pr_number: u64,
    comment_ids: Vec<i64>,
) -> Result<ReviewSubmissionResult, AppError> {
    submit::run(&state.comments, &repo_path, pr_number, &comment_ids).await
}

use markdown_reviewer_core::application::sync::{cache, mutations, refresh};
use markdown_reviewer_core::domain::{RefreshResult, RemoteComment, RemoteThread};
use markdown_reviewer_core::AppError;
use tauri::State;

use crate::state::AppState;

#[tauri::command(rename_all = "camelCase")]
pub async fn refresh_remote_comments(
    state: State<'_, AppState>,
    repo_path: String,
    pr_number: u64,
    head_sha: String,
) -> Result<RefreshResult, AppError> {
    refresh::run(&state.sync, &repo_path, pr_number, &head_sha).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn get_cached_remote_threads(
    state: State<'_, AppState>,
    repo_path: String,
    pr_number: u64,
) -> Result<Option<RefreshResult>, AppError> {
    cache::get_cached(&state.sync, &repo_path, pr_number).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn reply_remote_thread(
    state: State<'_, AppState>,
    repo_path: String,
    pr_number: u64,
    in_reply_to_comment_id: i64,
    body: String,
) -> Result<RemoteComment, AppError> {
    mutations::reply(
        &state.sync,
        &repo_path,
        pr_number,
        in_reply_to_comment_id,
        &body,
    )
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn edit_remote_comment(
    state: State<'_, AppState>,
    repo_path: String,
    comment_id: i64,
    body: String,
) -> Result<RemoteComment, AppError> {
    mutations::edit(&state.sync, &repo_path, comment_id, &body).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn delete_remote_comment(
    state: State<'_, AppState>,
    repo_path: String,
    comment_id: i64,
) -> Result<(), AppError> {
    mutations::delete(&state.sync, &repo_path, comment_id).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn resolve_remote_thread(
    state: State<'_, AppState>,
    repo_path: String,
    thread_id: String,
) -> Result<RemoteThread, AppError> {
    mutations::resolve(&state.sync, &repo_path, &thread_id).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn reopen_remote_thread(
    state: State<'_, AppState>,
    repo_path: String,
    thread_id: String,
) -> Result<RemoteThread, AppError> {
    mutations::reopen(&state.sync, &repo_path, &thread_id).await
}

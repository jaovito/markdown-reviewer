use markdown_reviewer_core::application::pull_requests::{
    changed_files::list_changed_files as changed_files_uc,
    file_diff::load_file_diff as file_diff_uc, list::list_pull_requests as list_uc,
    load::load_pull_request as load_uc,
};
use markdown_reviewer_core::domain::{
    ChangedFile, FileDiff, PullRequestDetail, PullRequestSummary,
};
use markdown_reviewer_core::AppError;
use tauri::State;

use crate::state::AppState;

#[tauri::command(rename_all = "camelCase")]
pub async fn list_pull_requests(
    state: State<'_, AppState>,
    repo_path: String,
) -> Result<Vec<PullRequestSummary>, AppError> {
    list_uc(&state.pull_requests, &repo_path).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn load_pull_request(
    state: State<'_, AppState>,
    repo_path: String,
    pr_number: u64,
) -> Result<PullRequestDetail, AppError> {
    load_uc(&state.pull_requests, &repo_path, pr_number).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn list_changed_files(
    state: State<'_, AppState>,
    repo_path: String,
    pr_number: u64,
) -> Result<Vec<ChangedFile>, AppError> {
    changed_files_uc(&state.pull_requests, &repo_path, pr_number).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn load_file_diff(
    state: State<'_, AppState>,
    repo_path: String,
    pr_number: u64,
    file_path: String,
) -> Result<FileDiff, AppError> {
    file_diff_uc(&state.pull_requests, &repo_path, pr_number, &file_path).await
}

use markdown_reviewer_core::application::pull_requests::{
    list::list_pull_requests as list_uc, load::load_pull_request as load_uc,
};
use markdown_reviewer_core::domain::{PullRequestDetail, PullRequestSummary};
use markdown_reviewer_core::AppError;
use tauri::State;

use crate::state::AppState;

#[tauri::command]
pub async fn list_pull_requests(
    state: State<'_, AppState>,
    repo_path: String,
) -> Result<Vec<PullRequestSummary>, AppError> {
    list_uc(&state.pull_requests, &repo_path).await
}

#[tauri::command]
pub async fn load_pull_request(
    state: State<'_, AppState>,
    repo_path: String,
    pr_number: u64,
) -> Result<PullRequestDetail, AppError> {
    load_uc(&state.pull_requests, &repo_path, pr_number).await
}

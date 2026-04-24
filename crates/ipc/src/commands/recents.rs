use markdown_reviewer_core::application::repo_selection::recents;
use markdown_reviewer_core::domain::Repository;
use markdown_reviewer_core::ports::RecentRepository;
use markdown_reviewer_core::AppError;
use tauri::State;

use crate::dto::PathArgs;
use crate::state::AppState;

#[tauri::command]
pub async fn list_recent_repositories(
    state: State<'_, AppState>,
) -> Result<Vec<RecentRepository>, AppError> {
    recents::list(&state.repo_selection).await
}

#[tauri::command]
pub async fn add_recent_repository(
    state: State<'_, AppState>,
    repo: Repository,
) -> Result<RecentRepository, AppError> {
    recents::add(&state.repo_selection, &repo).await
}

#[tauri::command]
pub async fn remove_recent_repository(
    state: State<'_, AppState>,
    args: PathArgs,
) -> Result<(), AppError> {
    recents::remove(&state.repo_selection, &args.path).await
}

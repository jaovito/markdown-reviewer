use markdown_reviewer_core::application::remote_repos;
use markdown_reviewer_core::domain::{RemoteRepository, Repository};
use markdown_reviewer_core::AppError;
use tauri::State;

use crate::state::AppState;

#[tauri::command]
pub async fn list_remote_repositories(
    state: State<'_, AppState>,
    query: Option<String>,
    limit: Option<u32>,
) -> Result<Vec<RemoteRepository>, AppError> {
    remote_repos::list_user_repositories(
        &state.repo_selection,
        query.as_deref(),
        limit.unwrap_or(100),
    )
    .await
}

#[tauri::command]
pub async fn clone_repository(
    state: State<'_, AppState>,
    repo_name_with_owner: String,
    target_parent_dir: String,
) -> Result<Repository, AppError> {
    remote_repos::clone_repository(
        &state.repo_selection,
        &repo_name_with_owner,
        &target_parent_dir,
    )
    .await
}

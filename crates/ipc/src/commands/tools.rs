use markdown_reviewer_core::application::repo_selection::check_tools;
use markdown_reviewer_core::domain::ToolStatus;
use markdown_reviewer_core::AppError;
use tauri::State;

use crate::state::AppState;

#[tauri::command]
pub async fn check_tools(state: State<'_, AppState>) -> Result<ToolStatus, AppError> {
    check_tools::check_tools(&state.repo_selection).await
}

/// Returns the authenticated GitHub username (`null` when not logged in).
/// Used by the comments feature to stamp `author` on freshly created drafts.
#[tauri::command]
pub async fn get_gh_user(state: State<'_, AppState>) -> Result<Option<String>, AppError> {
    let report = state.repo_selection.gh.auth_status().await?;
    if !report.authenticated {
        return Ok(None);
    }
    Ok(report.username)
}

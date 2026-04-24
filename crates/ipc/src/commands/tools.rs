use markdown_reviewer_core::application::repo_selection::check_tools;
use markdown_reviewer_core::domain::ToolStatus;
use markdown_reviewer_core::AppError;
use tauri::State;

use crate::state::AppState;

#[tauri::command]
pub async fn check_tools(state: State<'_, AppState>) -> Result<ToolStatus, AppError> {
    check_tools::check_tools(&state.repo_selection).await
}

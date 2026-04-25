use markdown_reviewer_core::application::files::read_markdown_file::read_markdown_file as read_uc;
use markdown_reviewer_core::AppError;
use tauri::State;

use crate::state::AppState;

#[tauri::command(rename_all = "camelCase")]
pub async fn read_markdown_file(
    state: State<'_, AppState>,
    repo_path: String,
    sha: String,
    file_path: String,
) -> Result<String, AppError> {
    read_uc(&state.files, &repo_path, &sha, &file_path).await
}

use markdown_reviewer_core::application::repo_selection::validate_repository as vr;
use markdown_reviewer_core::domain::Repository;
use markdown_reviewer_core::AppError;
use tauri::{AppHandle, Runtime, State};
use tauri_plugin_dialog::DialogExt;

use crate::state::AppState;

#[tauri::command]
pub async fn select_repository<R: Runtime>(app: AppHandle<R>) -> Result<Option<String>, AppError> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog().file().pick_folder(move |folder| {
        let _ = tx.send(folder.and_then(|p| p.into_path().ok()));
    });
    let picked = rx.await.map_err(AppError::unexpected)?;
    Ok(picked.map(|p| p.to_string_lossy().into_owned()))
}

#[tauri::command]
pub async fn validate_repository(
    state: State<'_, AppState>,
    path: String,
) -> Result<Repository, AppError> {
    vr::validate_repository(&state.repo_selection, &path).await
}

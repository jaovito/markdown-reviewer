pub mod commands;
pub mod dto;
pub mod state;

pub use state::AppState;

use tauri::{generate_handler, Runtime};

/// Registers every Phase 1 command handler.
pub fn register<R: Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
    builder.invoke_handler(generate_handler![
        commands::tools::check_tools,
        commands::repo::select_repository,
        commands::repo::validate_repository,
        commands::recents::list_recent_repositories,
        commands::recents::add_recent_repository,
        commands::recents::remove_recent_repository,
    ])
}

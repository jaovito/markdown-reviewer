pub mod commands;
pub mod dto;
pub mod state;

pub use state::AppState;

use tauri::{generate_handler, Runtime};

/// Registers every command handler exposed to the `WebView`.
pub fn register<R: Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
    builder.invoke_handler(generate_handler![
        commands::tools::check_tools,
        commands::repo::select_repository,
        commands::repo::validate_repository,
        commands::recents::list_recent_repositories,
        commands::recents::add_recent_repository,
        commands::recents::remove_recent_repository,
        commands::pull_requests::list_pull_requests,
        commands::pull_requests::load_pull_request,
        commands::pull_requests::list_changed_files,
        commands::files::read_markdown_file,
    ])
}

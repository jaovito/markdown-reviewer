pub mod commands;
pub mod dto;
pub mod state;

pub use state::AppState;

use tauri::{generate_handler, Runtime};

/// Registers every command handler exposed to the `WebView`.
pub fn register<R: Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
    builder.invoke_handler(generate_handler![
        commands::tools::check_tools,
        commands::tools::get_gh_user,
        commands::repo::select_repository,
        commands::repo::validate_repository,
        commands::recents::list_recent_repositories,
        commands::recents::add_recent_repository,
        commands::recents::remove_recent_repository,
        commands::pull_requests::list_pull_requests,
        commands::pull_requests::load_pull_request,
        commands::pull_requests::list_changed_files,
        commands::pull_requests::load_file_diff,
        commands::files::read_markdown_file,
        commands::comments::list_local_comments,
        commands::comments::list_local_comments_for_file,
        commands::comments::create_local_comment,
        commands::comments::update_local_comment,
        commands::comments::delete_local_comment,
        commands::comments::submit_review,
    ])
}

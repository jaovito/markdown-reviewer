use std::sync::Arc;

use markdown_reviewer_core::application::repo_selection::RepoSelection;
use markdown_reviewer_infra::{
    logging,
    sqlite::{open_and_migrate, SqliteRecentsStore},
    GhCli, GitCli, Paths, SystemClock,
};
use markdown_reviewer_ipc::AppState;
use tauri::Manager;

pub(crate) fn run() {
    let builder = tauri::Builder::default().plugin(tauri_plugin_dialog::init());

    let builder = markdown_reviewer_ipc::register(builder);

    builder
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .expect("resolve app data dir");
            let paths = Paths::from_data_dir(&data_dir)?;

            // Keep the guard alive for the lifetime of the app.
            let guard = logging::init(&paths.logs_dir);
            app.manage(LogGuard(guard));

            tracing::info!(data_dir = %paths.data_dir.display(), "bootstrapping");

            let db = open_and_migrate(&paths.db_path)?;

            let state = AppState {
                repo_selection: RepoSelection {
                    git: Arc::new(GitCli),
                    gh: Arc::new(GhCli),
                    recents: Arc::new(SqliteRecentsStore::new(db)),
                    clock: Arc::new(SystemClock),
                },
            };
            app.manage(state);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Newtype so we can store the tracing guard in Tauri's state map.
struct LogGuard(#[allow(dead_code)] tracing_appender::non_blocking::WorkerGuard);

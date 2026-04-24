mod bootstrap;

/// Entry point invoked by `main.rs` (desktop) and the mobile targets.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    bootstrap::run();
}

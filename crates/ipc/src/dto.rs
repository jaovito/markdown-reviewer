//! Boundary DTOs used by `#[tauri::command]` handlers.
//!
//! Prefer scalar command arguments when a command takes 0 or 1 fields — Tauri
//! v2 derives arg keys from the Rust parameter name, so `pub async fn foo(path:
//! String)` maps to `invoke("foo", { path })` without a wrapper struct. Only
//! introduce a DTO here when the command takes multiple fields that belong
//! together.

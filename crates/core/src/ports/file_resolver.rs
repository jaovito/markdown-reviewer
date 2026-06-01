use async_trait::async_trait;

use crate::AppResult;

/// Reads a file's contents at a specific commit. Used by the sync layer
/// to fetch the original snippet a remote thread was anchored to so it
/// can be re-located in the current head.
///
/// Implementations are expected to be transparent about *where* the
/// content came from — if the local clone doesn't have `sha`, the
/// adapter may delegate to `gh` (or another fallback) and return the
/// content as if it were local. Errors propagate (`AppError::FileNotFound`
/// when the path doesn't exist at the ref, other variants for IO /
/// process failures); callers handle them rather than ask which source
/// succeeded.
#[async_trait]
pub trait FileResolver: Send + Sync {
    async fn read(&self, repo_path: &str, sha: &str, file_path: &str) -> AppResult<String>;
}

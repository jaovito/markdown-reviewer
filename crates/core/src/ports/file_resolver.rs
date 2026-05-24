use async_trait::async_trait;

use crate::AppResult;

/// Reads a file's contents at a specific commit. Implementations may fall
/// back to `gh` when the ref isn't in the local clone.
#[async_trait]
pub trait FileResolver: Send + Sync {
    async fn read(&self, repo_path: &str, sha: &str, file_path: &str) -> AppResult<String>;
}

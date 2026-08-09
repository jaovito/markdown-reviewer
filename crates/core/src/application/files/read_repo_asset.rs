use crate::{AppError, AppResult};

use super::Files;

/// Upper bound on an asset served to the `WebView`. Large enough for any
/// screenshot a doc would reasonably embed, small enough that a stray binary
/// cannot pin memory or stall the render.
pub const MAX_ASSET_BYTES: usize = 10 * 1024 * 1024;

/// Returns the raw bytes of `<file_path>` at `<sha>` for `<repo_path>`.
///
/// Mirrors `read_markdown_file`: the local object database first via
/// `git show`, then the GitHub Contents API when the ref was never fetched.
/// Resolving through git rather than the working tree is what keeps this from
/// being a filesystem-traversal primitive — `git show <sha>:<path>` resolves
/// inside a tree object, so `../../etc/passwd` simply does not exist.
pub async fn read_repo_asset(
    svc: &Files,
    repo_path: &str,
    sha: &str,
    file_path: &str,
) -> AppResult<Vec<u8>> {
    let bytes = match svc.git.show_file_bytes(repo_path, sha, file_path).await? {
        Some(bytes) => bytes,
        None => svc.gh.get_file_bytes(repo_path, sha, file_path).await?,
    };

    if bytes.len() > MAX_ASSET_BYTES {
        return Err(AppError::validation(format!(
            "asset `{file_path}` is {} bytes, over the {MAX_ASSET_BYTES} byte limit",
            bytes.len()
        )));
    }

    Ok(bytes)
}

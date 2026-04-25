use crate::AppResult;

use super::Files;

/// Returns the contents of `<file_path>` at `<sha>` for `<repo_path>`.
/// Tries the local working tree first via `git show`; on a miss (the ref
/// hasn't been fetched), falls back to the GitHub Contents API.
pub async fn read_markdown_file(
    svc: &Files,
    repo_path: &str,
    sha: &str,
    file_path: &str,
) -> AppResult<String> {
    if let Some(content) = svc.git.show_file(repo_path, sha, file_path).await? {
        return Ok(content);
    }
    svc.gh.get_file_content(repo_path, sha, file_path).await
}

use crate::domain::FileDiff;
use crate::AppError;
use crate::AppResult;

use super::PullRequests;

/// Loads PR detail to fetch the base/head SHAs, then asks the local git
/// adapter for the head-side hunks of `<file_path>`. Returns an empty
/// `hunks` list when the refs aren't in the local clone — Phase 6 will add
/// an explicit fetch action.
pub async fn load_file_diff(
    svc: &PullRequests,
    repo_path: &str,
    pr_number: u64,
    file_path: &str,
) -> AppResult<FileDiff> {
    let detail = svc.gh.load_pull_request(repo_path, pr_number).await?;
    let head_sha = detail.head_sha.clone();
    let base_sha = detail.base_sha.clone();
    let hunks = svc
        .git
        .diff_hunks(repo_path, &base_sha, &head_sha, file_path)
        .await
        .map_err(|e| match e {
            AppError::Process { message }
                if message.to_lowercase().contains("unknown revision") =>
            {
                AppError::Process {
                    message: format!("base/head ref missing locally: {message}"),
                }
            }
            other => other,
        })?
        .unwrap_or_default();
    Ok(FileDiff {
        file_path: file_path.to_string(),
        head_sha,
        base_sha,
        hunks,
    })
}

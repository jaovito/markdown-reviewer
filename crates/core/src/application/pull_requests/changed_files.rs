use crate::domain::ChangedFile;
use crate::AppResult;

use super::PullRequests;

pub async fn list_changed_files(
    svc: &PullRequests,
    repo_path: &str,
    number: u64,
) -> AppResult<Vec<ChangedFile>> {
    svc.gh.list_changed_files(repo_path, number).await
}

use crate::domain::PullRequestSummary;
use crate::AppResult;

use super::PullRequests;

pub async fn list_pull_requests(
    svc: &PullRequests,
    repo_path: &str,
) -> AppResult<Vec<PullRequestSummary>> {
    svc.gh.list_pull_requests(repo_path).await
}

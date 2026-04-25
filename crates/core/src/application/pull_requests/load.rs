use crate::domain::PullRequestDetail;
use crate::AppResult;

use super::PullRequests;

pub async fn load_pull_request(
    svc: &PullRequests,
    repo_path: &str,
    number: u64,
) -> AppResult<PullRequestDetail> {
    svc.gh.load_pull_request(repo_path, number).await
}

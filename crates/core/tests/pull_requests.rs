use std::sync::Arc;

use async_trait::async_trait;
use markdown_reviewer_core::application::pull_requests::{
    list::list_pull_requests, load::load_pull_request, PullRequests,
};
use markdown_reviewer_core::domain::{PullRequestDetail, PullRequestState, PullRequestSummary};
use markdown_reviewer_core::ports::{GhAuthReport, GhClient};
use markdown_reviewer_core::{AppError, AppResult};

struct FakeGh {
    summaries: Vec<PullRequestSummary>,
    detail: Option<PullRequestDetail>,
    auth_error: Option<AppError>,
}

impl FakeGh {
    fn new(summaries: Vec<PullRequestSummary>, detail: Option<PullRequestDetail>) -> Self {
        Self {
            summaries,
            detail,
            auth_error: None,
        }
    }
}

#[async_trait]
impl GhClient for FakeGh {
    async fn version(&self) -> AppResult<String> {
        Ok("gh 2.50.0".into())
    }
    async fn auth_status(&self) -> AppResult<GhAuthReport> {
        Ok(GhAuthReport {
            authenticated: true,
            username: Some("octocat".into()),
            detail: String::new(),
        })
    }
    async fn list_pull_requests(&self, _repo_path: &str) -> AppResult<Vec<PullRequestSummary>> {
        if let Some(err) = &self.auth_error {
            return Err(err.clone());
        }
        Ok(self.summaries.clone())
    }
    async fn load_pull_request(
        &self,
        _repo_path: &str,
        number: u64,
    ) -> AppResult<PullRequestDetail> {
        if let Some(err) = &self.auth_error {
            return Err(err.clone());
        }
        match &self.detail {
            Some(d) if d.summary.number == number => Ok(d.clone()),
            _ => Err(AppError::PrNotFound { number }),
        }
    }
}

fn summary(number: u64, title: &str) -> PullRequestSummary {
    PullRequestSummary {
        number,
        title: title.into(),
        author: "octocat".into(),
        base_ref: "main".into(),
        head_ref: format!("feature/{number}"),
        state: PullRequestState::Open,
        is_draft: false,
        updated_at: "2026-04-24T10:00:00Z".into(),
        url: format!("https://github.com/o/r/pull/{number}"),
    }
}

fn svc_with(gh: FakeGh) -> PullRequests {
    PullRequests { gh: Arc::new(gh) }
}

#[tokio::test]
async fn list_returns_empty_vec() {
    let svc = svc_with(FakeGh::new(vec![], None));
    let prs = list_pull_requests(&svc, "/repo").await.unwrap();
    assert!(prs.is_empty());
}

#[tokio::test]
async fn list_preserves_order() {
    let svc = svc_with(FakeGh::new(
        vec![summary(7, "first"), summary(3, "second")],
        None,
    ));
    let prs = list_pull_requests(&svc, "/repo").await.unwrap();
    assert_eq!(prs.len(), 2);
    assert_eq!(prs[0].number, 7);
    assert_eq!(prs[1].number, 3);
}

#[tokio::test]
async fn list_propagates_auth_error() {
    let mut gh = FakeGh::new(vec![], None);
    gh.auth_error = Some(AppError::GhNotAuthenticated);
    let svc = svc_with(gh);
    let err = list_pull_requests(&svc, "/repo").await.unwrap_err();
    assert!(matches!(err, AppError::GhNotAuthenticated));
}

#[tokio::test]
async fn load_returns_detail() {
    let detail = PullRequestDetail {
        summary: summary(42, "the answer"),
        body: Some("hello".into()),
        head_sha: "deadbeef".into(),
        base_sha: "cafebabe".into(),
        additions: 10,
        deletions: 2,
        changed_files: 3,
    };
    let svc = svc_with(FakeGh::new(vec![], Some(detail.clone())));
    let got = load_pull_request(&svc, "/repo", 42).await.unwrap();
    assert_eq!(got, detail);
}

#[tokio::test]
async fn load_missing_returns_pr_not_found() {
    let svc = svc_with(FakeGh::new(vec![], None));
    let err = load_pull_request(&svc, "/repo", 99).await.unwrap_err();
    assert!(matches!(err, AppError::PrNotFound { number: 99 }));
}

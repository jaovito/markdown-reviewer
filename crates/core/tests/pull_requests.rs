use std::sync::Arc;

use async_trait::async_trait;
use markdown_reviewer_core::application::pull_requests::{
    changed_files::list_changed_files, file_diff::load_file_diff, list::list_pull_requests,
    load::load_pull_request, PullRequests,
};
use markdown_reviewer_core::domain::{
    ChangeStatus, ChangedFile, DiffHunk, HunkKind, PullRequestDetail, PullRequestState,
    PullRequestSummary,
};
use markdown_reviewer_core::ports::{GhAuthReport, GhClient, GitClient};
use markdown_reviewer_core::{AppError, AppResult};

struct FakeGh {
    summaries: Vec<PullRequestSummary>,
    detail: Option<PullRequestDetail>,
    files: Vec<ChangedFile>,
    auth_error: Option<AppError>,
}

impl FakeGh {
    fn new(summaries: Vec<PullRequestSummary>, detail: Option<PullRequestDetail>) -> Self {
        Self {
            summaries,
            detail,
            files: Vec::new(),
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
    async fn list_changed_files(
        &self,
        _repo_path: &str,
        _number: u64,
    ) -> AppResult<Vec<ChangedFile>> {
        if let Some(err) = &self.auth_error {
            return Err(err.clone());
        }
        Ok(self.files.clone())
    }
    async fn get_file_content(
        &self,
        _repo_path: &str,
        _sha: &str,
        _file_path: &str,
    ) -> AppResult<String> {
        Ok(String::new())
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

struct FakeGit {
    hunks: Option<Vec<DiffHunk>>,
}

#[async_trait]
impl GitClient for FakeGit {
    async fn version(&self) -> AppResult<String> {
        Ok("git 2.43".into())
    }
    async fn is_git_repo(&self, _path: &str) -> AppResult<bool> {
        Ok(true)
    }
    async fn remote_origin_url(&self, _path: &str) -> AppResult<Option<String>> {
        Ok(None)
    }
    async fn current_branch(&self, _path: &str) -> AppResult<Option<String>> {
        Ok(None)
    }
    async fn show_file(
        &self,
        _repo_path: &str,
        _sha: &str,
        _file_path: &str,
    ) -> AppResult<Option<String>> {
        Ok(None)
    }
    async fn diff_hunks(
        &self,
        _repo_path: &str,
        _base: &str,
        _head: &str,
        _file_path: &str,
    ) -> AppResult<Option<Vec<DiffHunk>>> {
        Ok(self.hunks.clone())
    }
}

fn svc_with(gh: FakeGh) -> PullRequests {
    PullRequests {
        gh: Arc::new(gh),
        git: Arc::new(FakeGit { hunks: None }),
    }
}

fn svc_with_git(gh: FakeGh, git: FakeGit) -> PullRequests {
    PullRequests {
        gh: Arc::new(gh),
        git: Arc::new(git),
    }
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

fn changed(path: &str, status: ChangeStatus, additions: u32, deletions: u32) -> ChangedFile {
    ChangedFile {
        path: path.into(),
        previous_path: None,
        status,
        additions,
        deletions,
    }
}

#[tokio::test]
async fn changed_files_empty_vec() {
    let svc = svc_with(FakeGh::new(vec![], None));
    let files = list_changed_files(&svc, "/repo", 1).await.unwrap();
    assert!(files.is_empty());
}

#[tokio::test]
async fn changed_files_preserves_order_and_payload() {
    let mut gh = FakeGh::new(vec![], None);
    gh.files = vec![
        changed("README.md", ChangeStatus::Modified, 5, 2),
        changed("src/lib.rs", ChangeStatus::Added, 12, 0),
    ];
    let svc = svc_with(gh);
    let files = list_changed_files(&svc, "/repo", 1).await.unwrap();
    assert_eq!(files.len(), 2);
    assert_eq!(files[0].path, "README.md");
    assert_eq!(files[0].additions, 5);
    assert!(matches!(files[1].status, ChangeStatus::Added));
}

#[tokio::test]
async fn changed_files_propagates_auth_error() {
    let mut gh = FakeGh::new(vec![], None);
    gh.auth_error = Some(AppError::GhNotAuthenticated);
    let svc = svc_with(gh);
    let err = list_changed_files(&svc, "/repo", 1).await.unwrap_err();
    assert!(matches!(err, AppError::GhNotAuthenticated));
}

#[tokio::test]
async fn file_diff_returns_hunks_from_git() {
    let detail = PullRequestDetail {
        summary: summary(7, "test"),
        body: None,
        head_sha: "head1".into(),
        base_sha: "base1".into(),
        additions: 0,
        deletions: 0,
        changed_files: 1,
    };
    let svc = svc_with_git(
        FakeGh::new(vec![], Some(detail)),
        FakeGit {
            hunks: Some(vec![DiffHunk {
                start_line: 1,
                end_line: 3,
                kind: HunkKind::Added,
            }]),
        },
    );
    let diff = load_file_diff(&svc, "/repo", 7, "README.md").await.unwrap();
    assert_eq!(diff.head_sha, "head1");
    assert_eq!(diff.base_sha, "base1");
    assert_eq!(diff.hunks.len(), 1);
}

#[tokio::test]
async fn file_diff_empty_when_refs_missing_locally() {
    let detail = PullRequestDetail {
        summary: summary(7, "t"),
        body: None,
        head_sha: "h".into(),
        base_sha: "b".into(),
        additions: 0,
        deletions: 0,
        changed_files: 1,
    };
    let svc = svc_with_git(FakeGh::new(vec![], Some(detail)), FakeGit { hunks: None });
    let diff = load_file_diff(&svc, "/repo", 7, "README.md").await.unwrap();
    assert!(diff.hunks.is_empty());
}

use std::sync::Arc;

use async_trait::async_trait;
use markdown_reviewer_core::application::files::{read_markdown_file::read_markdown_file, Files};
use markdown_reviewer_core::ports::{GhAuthReport, GhClient, GitClient};
use markdown_reviewer_core::{AppError, AppResult};

struct FakeGit {
    show: Option<String>,
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
        Ok(self.show.clone())
    }
    async fn diff_hunks(
        &self,
        _repo_path: &str,
        _base: &str,
        _head: &str,
        _file_path: &str,
    ) -> AppResult<Option<Vec<markdown_reviewer_core::domain::DiffHunk>>> {
        Ok(Some(Vec::new()))
    }
}

struct FakeGh {
    fallback: AppResult<String>,
}

#[async_trait]
impl GhClient for FakeGh {
    async fn version(&self) -> AppResult<String> {
        Ok("gh 2.50".into())
    }
    async fn auth_status(&self) -> AppResult<GhAuthReport> {
        Ok(GhAuthReport {
            authenticated: true,
            username: Some("octocat".into()),
            detail: String::new(),
        })
    }
    async fn list_pull_requests(
        &self,
        _repo_path: &str,
    ) -> AppResult<Vec<markdown_reviewer_core::domain::PullRequestSummary>> {
        Ok(Vec::new())
    }
    async fn load_pull_request(
        &self,
        _repo_path: &str,
        number: u64,
    ) -> AppResult<markdown_reviewer_core::domain::PullRequestDetail> {
        Err(AppError::PrNotFound { number })
    }
    async fn list_changed_files(
        &self,
        _repo_path: &str,
        _number: u64,
    ) -> AppResult<Vec<markdown_reviewer_core::domain::ChangedFile>> {
        Ok(Vec::new())
    }
    async fn get_file_content(
        &self,
        _repo_path: &str,
        _sha: &str,
        _file_path: &str,
    ) -> AppResult<String> {
        self.fallback.clone()
    }
}

fn svc(git_show: Option<String>, gh_fallback: AppResult<String>) -> Files {
    Files {
        git: Arc::new(FakeGit { show: git_show }),
        gh: Arc::new(FakeGh {
            fallback: gh_fallback,
        }),
    }
}

#[tokio::test]
async fn returns_git_show_content_when_present() {
    let svc = svc(Some("# from git".into()), Err(AppError::unexpected("nope")));
    let got = read_markdown_file(&svc, "/r", "abc", "README.md")
        .await
        .unwrap();
    assert_eq!(got, "# from git");
}

#[tokio::test]
async fn falls_back_to_gh_when_ref_missing_locally() {
    let svc = svc(None, Ok("# from gh".into()));
    let got = read_markdown_file(&svc, "/r", "abc", "README.md")
        .await
        .unwrap();
    assert_eq!(got, "# from gh");
}

#[tokio::test]
async fn surfaces_file_not_found_from_gh() {
    let svc = svc(
        None,
        Err(AppError::FileNotFound {
            sha: "abc".into(),
            path: "missing.md".into(),
        }),
    );
    let err = read_markdown_file(&svc, "/r", "abc", "missing.md")
        .await
        .unwrap_err();
    assert!(matches!(err, AppError::FileNotFound { .. }));
}

use std::sync::Arc;

use async_trait::async_trait;
use markdown_reviewer_core::application::repo_selection::{
    check_tools::check_tools, recents, validate_repository::validate_repository, RepoSelection,
};
use markdown_reviewer_core::ports::{
    Clock, GhAuthReport, GhClient, GitClient, RecentRepository, RecentsStore,
};
use markdown_reviewer_core::AppError;
use time::OffsetDateTime;
use tokio::sync::Mutex;

struct FakeGit {
    is_repo: bool,
    remote: Option<String>,
    branch: Option<String>,
}

#[async_trait]
impl GitClient for FakeGit {
    async fn version(&self) -> markdown_reviewer_core::AppResult<String> {
        Ok("git version 2.43.0".into())
    }
    async fn is_git_repo(&self, _path: &str) -> markdown_reviewer_core::AppResult<bool> {
        Ok(self.is_repo)
    }
    async fn remote_origin_url(
        &self,
        _path: &str,
    ) -> markdown_reviewer_core::AppResult<Option<String>> {
        Ok(self.remote.clone())
    }
    async fn current_branch(
        &self,
        _path: &str,
    ) -> markdown_reviewer_core::AppResult<Option<String>> {
        Ok(self.branch.clone())
    }
    async fn show_file(
        &self,
        _repo_path: &str,
        _sha: &str,
        _file_path: &str,
    ) -> markdown_reviewer_core::AppResult<Option<String>> {
        Ok(None)
    }
}

struct FakeGh {
    version_ok: bool,
    auth: bool,
}

#[async_trait]
impl GhClient for FakeGh {
    async fn version(&self) -> markdown_reviewer_core::AppResult<String> {
        if self.version_ok {
            Ok("gh 2.50.0".into())
        } else {
            Err(AppError::MissingTool { name: "gh".into() })
        }
    }
    async fn auth_status(&self) -> markdown_reviewer_core::AppResult<GhAuthReport> {
        Ok(GhAuthReport {
            authenticated: self.auth,
            username: if self.auth {
                Some("octocat".into())
            } else {
                None
            },
            detail: String::new(),
        })
    }
    async fn list_pull_requests(
        &self,
        _repo_path: &str,
    ) -> markdown_reviewer_core::AppResult<Vec<markdown_reviewer_core::domain::PullRequestSummary>>
    {
        Ok(Vec::new())
    }
    async fn load_pull_request(
        &self,
        _repo_path: &str,
        number: u64,
    ) -> markdown_reviewer_core::AppResult<markdown_reviewer_core::domain::PullRequestDetail> {
        Err(AppError::PrNotFound { number })
    }
    async fn list_changed_files(
        &self,
        _repo_path: &str,
        _number: u64,
    ) -> markdown_reviewer_core::AppResult<Vec<markdown_reviewer_core::domain::ChangedFile>> {
        Ok(Vec::new())
    }
    async fn get_file_content(
        &self,
        _repo_path: &str,
        _sha: &str,
        _file_path: &str,
    ) -> markdown_reviewer_core::AppResult<String> {
        Ok(String::new())
    }
}

#[derive(Default)]
struct InMemoryRecents {
    inner: Mutex<Vec<RecentRepository>>,
}

#[async_trait]
impl RecentsStore for InMemoryRecents {
    async fn list(&self) -> markdown_reviewer_core::AppResult<Vec<RecentRepository>> {
        Ok(self.inner.lock().await.clone())
    }
    async fn upsert(&self, entry: RecentRepository) -> markdown_reviewer_core::AppResult<()> {
        let mut guard = self.inner.lock().await;
        guard.retain(|e| e.path != entry.path);
        guard.insert(0, entry);
        Ok(())
    }
    async fn remove(&self, path: &str) -> markdown_reviewer_core::AppResult<()> {
        let mut guard = self.inner.lock().await;
        guard.retain(|e| e.path != path);
        Ok(())
    }
}

struct FixedClock;
impl Clock for FixedClock {
    fn now(&self) -> OffsetDateTime {
        OffsetDateTime::from_unix_timestamp(1_700_000_000).unwrap()
    }
}

fn svc_with(git: FakeGit, gh: FakeGh) -> RepoSelection {
    RepoSelection {
        git: Arc::new(git),
        gh: Arc::new(gh),
        recents: Arc::new(InMemoryRecents::default()),
        clock: Arc::new(FixedClock),
    }
}

#[tokio::test]
async fn validate_ok() {
    let svc = svc_with(
        FakeGit {
            is_repo: true,
            remote: Some("git@github.com:weqora/markdown-reviewer.git".into()),
            branch: Some("main".into()),
        },
        FakeGh {
            version_ok: true,
            auth: true,
        },
    );
    let repo = validate_repository(&svc, "/tmp/x").await.unwrap();
    assert_eq!(repo.owner, "weqora");
    assert_eq!(repo.repo, "markdown-reviewer");
    assert_eq!(repo.current_branch.as_deref(), Some("main"));
}

#[tokio::test]
async fn validate_not_a_repo() {
    let svc = svc_with(
        FakeGit {
            is_repo: false,
            remote: None,
            branch: None,
        },
        FakeGh {
            version_ok: true,
            auth: true,
        },
    );
    let err = validate_repository(&svc, "/tmp/x").await.unwrap_err();
    assert!(matches!(err, AppError::NotAGitRepo { .. }));
}

#[tokio::test]
async fn validate_no_github_remote() {
    let svc = svc_with(
        FakeGit {
            is_repo: true,
            remote: Some("git@gitlab.com:foo/bar.git".into()),
            branch: None,
        },
        FakeGh {
            version_ok: true,
            auth: true,
        },
    );
    let err = validate_repository(&svc, "/tmp/x").await.unwrap_err();
    assert!(matches!(err, AppError::NoGithubRemote { .. }));
}

#[tokio::test]
async fn check_tools_missing_gh() {
    let svc = svc_with(
        FakeGit {
            is_repo: true,
            remote: None,
            branch: None,
        },
        FakeGh {
            version_ok: false,
            auth: false,
        },
    );
    let status = check_tools(&svc).await.unwrap();
    assert!(status.git.is_ok());
    assert!(!status.gh.is_ok());
}

#[tokio::test]
async fn recents_round_trip() {
    let svc = svc_with(
        FakeGit {
            is_repo: true,
            remote: Some("https://github.com/a/b".into()),
            branch: None,
        },
        FakeGh {
            version_ok: true,
            auth: true,
        },
    );
    let repo = validate_repository(&svc, "/tmp/x").await.unwrap();
    recents::add(&svc, &repo).await.unwrap();
    let list = recents::list(&svc).await.unwrap();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].label, "a/b");
    recents::remove(&svc, "/tmp/x").await.unwrap();
    assert!(recents::list(&svc).await.unwrap().is_empty());
}

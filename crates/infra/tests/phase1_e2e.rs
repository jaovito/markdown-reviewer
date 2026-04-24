//! Phase 1 end-to-end scenarios — wires real `git`, real `SQLite`, and the
//! production adapters together through the `RepoSelection` use case bundle.
//!
//! This stops short of launching the Tauri webview, but exercises everything
//! below the IPC boundary against real IO. Gated with `#[ignore]`.

mod common;

use std::sync::Arc;

use markdown_reviewer_core::application::repo_selection::{
    recents, validate_repository::validate_repository, RepoSelection,
};
use markdown_reviewer_core::ports::{GhAuthReport, GhClient};
use markdown_reviewer_core::AppError;
use markdown_reviewer_infra::sqlite::{open_and_migrate, SqliteRecentsStore};
use markdown_reviewer_infra::{GitCli, SystemClock};
use tempfile::TempDir;

/// Stub GH client — Phase 1 scenarios only need auth status, not real network.
struct StubGh {
    authed: bool,
}

#[async_trait::async_trait]
impl GhClient for StubGh {
    async fn version(&self) -> markdown_reviewer_core::AppResult<String> {
        Ok("gh 2.50.0 (stub)".into())
    }
    async fn auth_status(&self) -> markdown_reviewer_core::AppResult<GhAuthReport> {
        Ok(GhAuthReport {
            authenticated: self.authed,
            username: self.authed.then_some("octocat".into()),
            detail: String::new(),
        })
    }
}

fn svc(db_dir: &std::path::Path, authed: bool) -> RepoSelection {
    let db = open_and_migrate(&db_dir.join("store.sqlite")).unwrap();
    RepoSelection {
        git: Arc::new(GitCli),
        gh: Arc::new(StubGh { authed }),
        recents: Arc::new(SqliteRecentsStore::new(db)),
        clock: Arc::new(SystemClock),
    }
}

#[tokio::test]
#[ignore = "end-to-end with real git + sqlite; run with --ignored"]
async fn valid_repo_validates_and_persists_recent() {
    let repo = TempDir::new().unwrap();
    let db = TempDir::new().unwrap();
    common::init_repo(repo.path());
    common::set_remote(repo.path(), "git@github.com:weqora/markdown-reviewer.git");

    let svc = svc(db.path(), true);

    let repo_info = validate_repository(&svc, repo.path().to_str().unwrap())
        .await
        .unwrap();
    assert_eq!(repo_info.owner, "weqora");
    assert_eq!(repo_info.repo, "markdown-reviewer");
    assert_eq!(repo_info.current_branch.as_deref(), Some("main"));

    recents::add(&svc, &repo_info).await.unwrap();
    let list = recents::list(&svc).await.unwrap();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].owner.as_deref(), Some("weqora"));
}

#[tokio::test]
#[ignore = "end-to-end with real git + sqlite; run with --ignored"]
async fn non_git_folder_returns_not_a_git_repo() {
    let repo = TempDir::new().unwrap();
    let db = TempDir::new().unwrap();
    let svc = svc(db.path(), true);

    let err = validate_repository(&svc, repo.path().to_str().unwrap())
        .await
        .unwrap_err();
    assert!(matches!(err, AppError::NotAGitRepo { .. }), "got {err:?}");
}

#[tokio::test]
#[ignore = "end-to-end with real git + sqlite; run with --ignored"]
async fn git_without_github_origin_returns_no_github_remote() {
    let repo = TempDir::new().unwrap();
    let db = TempDir::new().unwrap();
    common::init_repo(repo.path());
    common::set_remote(repo.path(), "git@gitlab.com:foo/bar.git");

    let svc = svc(db.path(), true);

    let err = validate_repository(&svc, repo.path().to_str().unwrap())
        .await
        .unwrap_err();
    assert!(
        matches!(err, AppError::NoGithubRemote { .. }),
        "got {err:?}"
    );
}

#[tokio::test]
#[ignore = "end-to-end with real git + sqlite; run with --ignored"]
async fn git_with_no_remote_returns_no_github_remote() {
    let repo = TempDir::new().unwrap();
    let db = TempDir::new().unwrap();
    common::init_repo(repo.path());

    let svc = svc(db.path(), true);

    let err = validate_repository(&svc, repo.path().to_str().unwrap())
        .await
        .unwrap_err();
    assert!(
        matches!(err, AppError::NoGithubRemote { .. }),
        "got {err:?}"
    );
}

#[tokio::test]
#[ignore = "end-to-end with real git + sqlite; run with --ignored"]
async fn recents_survives_reopen() {
    let repo = TempDir::new().unwrap();
    let db_dir = TempDir::new().unwrap();
    common::init_repo(repo.path());
    common::set_remote(repo.path(), "https://github.com/test/restart.git");

    // First app instance: validate + add to recents.
    {
        let svc = svc(db_dir.path(), true);
        let info = validate_repository(&svc, repo.path().to_str().unwrap())
            .await
            .unwrap();
        recents::add(&svc, &info).await.unwrap();
    }

    // Reopen: new service over the same SQLite file.
    let svc = svc(db_dir.path(), true);
    let list = recents::list(&svc).await.unwrap();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].repo.as_deref(), Some("restart"));
}

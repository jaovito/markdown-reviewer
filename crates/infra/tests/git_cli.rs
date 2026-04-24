//! Integration tests for `GitCli` against a real `git` binary.
//!
//! All tests spin up a temporary directory, run `git init`, and exercise the
//! adapter. Gated with `#[ignore]` — run with `cargo test -- --ignored`.

mod common;

use markdown_reviewer_core::ports::GitClient;
use markdown_reviewer_infra::GitCli;
use tempfile::TempDir;

#[tokio::test]
#[ignore = "shells out to real `git`; run with --ignored"]
async fn reports_git_version() {
    let git = GitCli;
    let v = git.version().await.expect("git --version");
    assert!(v.starts_with("git version "), "got {v:?}");
}

#[tokio::test]
#[ignore = "shells out to real `git`; run with --ignored"]
async fn detects_git_work_tree() {
    let dir = TempDir::new().unwrap();
    let git = GitCli;

    // Empty dir is not a repo.
    assert!(!git.is_git_repo(dir.path().to_str().unwrap()).await.unwrap());

    // After `git init`, same dir is a repo.
    common::init_repo(dir.path());
    assert!(git.is_git_repo(dir.path().to_str().unwrap()).await.unwrap());
}

#[tokio::test]
#[ignore = "shells out to real `git`; run with --ignored"]
async fn reads_origin_remote_or_returns_none() {
    let dir = TempDir::new().unwrap();
    common::init_repo(dir.path());
    let git = GitCli;
    let path = dir.path().to_str().unwrap();

    // Fresh repo has no origin.
    assert!(git.remote_origin_url(path).await.unwrap().is_none());

    // Add origin, expect that URL back.
    common::set_remote(dir.path(), "git@github.com:test/repo.git");
    let url = git.remote_origin_url(path).await.unwrap();
    assert_eq!(url.as_deref(), Some("git@github.com:test/repo.git"));
}

#[tokio::test]
#[ignore = "shells out to real `git`; run with --ignored"]
async fn reads_current_branch() {
    let dir = TempDir::new().unwrap();
    common::init_repo(dir.path());
    let git = GitCli;

    let branch = git
        .current_branch(dir.path().to_str().unwrap())
        .await
        .unwrap();
    assert_eq!(branch.as_deref(), Some("main"));
}

//! Shared helpers for infra integration tests.

use std::path::Path;
use std::process::Command;

pub(crate) fn git(repo: &Path, args: &[&str]) {
    let status = Command::new("git")
        .current_dir(repo)
        .args(args)
        .status()
        .expect("spawn git");
    assert!(status.success(), "git {args:?} failed");
}

pub(crate) fn init_repo(repo: &Path) {
    git(repo, &["init", "--initial-branch=main"]);
    git(repo, &["config", "user.email", "test@example.com"]);
    git(repo, &["config", "user.name", "Test"]);
    git(repo, &["commit", "--allow-empty", "-m", "initial"]);
}

pub(crate) fn set_remote(repo: &Path, url: &str) {
    git(repo, &["remote", "add", "origin", url]);
}

//! Guards the binary-safety of `show_file_bytes`. `process::run` decodes
//! stdout lossily, which corrupts any non-UTF-8 byte; this asserts the bytes
//! survive a round trip through `git show` exactly.

use markdown_reviewer_core::ports::GitClient;
use markdown_reviewer_infra::GitCli;

/// A tiny 1x1 PNG. Contains 0x89 and other bytes that are invalid UTF-8, so
/// a lossy decode mangles it into U+FFFD.
const PNG: &[u8] = &[
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
    0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
    0x42, 0x60, 0x82,
];

fn git(dir: &std::path::Path, args: &[&str]) {
    let out = std::process::Command::new("git")
        .args(args)
        .current_dir(dir)
        .output()
        .expect("run git");
    assert!(out.status.success(), "git {args:?} failed: {out:?}");
}

#[tokio::test]
#[ignore = "spawns git; run with --ignored"]
async fn reads_binary_bytes_without_corruption() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let dir = tmp.path();

    git(dir, &["init", "-q"]);
    git(dir, &["config", "user.email", "t@example.com"]);
    git(dir, &["config", "user.name", "T"]);
    std::fs::write(dir.join("pixel.png"), PNG).expect("write png");
    git(dir, &["add", "pixel.png"]);
    git(dir, &["commit", "-qm", "add pixel"]);

    let repo = dir.to_str().expect("utf8 path");
    let got = GitCli
        .show_file_bytes(repo, "HEAD", "pixel.png")
        .await
        .expect("show_file_bytes")
        .expect("file present at HEAD");

    assert_eq!(got, PNG, "bytes must survive git show byte-for-byte");
}

#[tokio::test]
#[ignore = "spawns git; run with --ignored"]
async fn missing_file_is_none_not_error() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let dir = tmp.path();
    git(dir, &["init", "-q"]);
    git(dir, &["config", "user.email", "t@example.com"]);
    git(dir, &["config", "user.name", "T"]);
    std::fs::write(dir.join("a.txt"), "hi").expect("write");
    git(dir, &["add", "a.txt"]);
    git(dir, &["commit", "-qm", "init"]);

    let repo = dir.to_str().expect("utf8 path");
    let got = GitCli
        .show_file_bytes(repo, "HEAD", "nope.png")
        .await
        .expect("call succeeds");
    assert!(got.is_none());
}

/// Regression test for a reviewer-found Critical: `show_file_bytes` builds
/// `git show <sha>:<file_path>` and passes `<sha>:<file_path>` as a single
/// argv element. Before `--end-of-options` was added, a `sha` shaped like
/// `--output=<path>` was parsed by `git` as its own `--output` flag rather
/// than as a revision, so a crafted `sha` turned this read into a write of
/// arbitrary content anywhere on disk. `mdasset://` reaches this function
/// with a `sha` taken straight from an `<img src>` query string in
/// already-sanitized (but attacker-authored) PR Markdown — zero clicks.
#[tokio::test]
#[ignore = "spawns git; run with --ignored"]
async fn end_of_options_blocks_argv_injection_via_sha() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let dir = tmp.path();
    git(dir, &["init", "-q"]);
    git(dir, &["config", "user.email", "t@example.com"]);
    git(dir, &["config", "user.name", "T"]);
    std::fs::write(dir.join("a.txt"), "hi").expect("write");
    git(dir, &["add", "a.txt"]);
    git(dir, &["commit", "-qm", "init"]);

    let victim_dir = dir.join("victim");
    std::fs::create_dir(&victim_dir).expect("mkdir victim");
    let malicious_sha = format!("--output={}/pwned", victim_dir.display());

    let repo = dir.to_str().expect("utf8 path");
    let result = GitCli
        .show_file_bytes(repo, &malicious_sha, "b.plist")
        .await
        .expect("call must not error, just fail to resolve");
    assert!(
        result.is_none(),
        "flag-shaped sha must not resolve to content"
    );

    let created: Vec<_> = std::fs::read_dir(&victim_dir)
        .expect("read victim dir")
        .collect();
    assert!(
        created.is_empty(),
        "git show must not write a file when sha looks like a flag, found: {created:?}"
    );
}

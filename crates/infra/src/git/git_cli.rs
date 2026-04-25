use async_trait::async_trait;
use markdown_reviewer_core::domain::{DiffHunk, HunkKind};
use markdown_reviewer_core::ports::GitClient;
use markdown_reviewer_core::{AppError, AppResult};

use crate::process::{run, run_ok};

const TIMEOUT_MS: u64 = 5_000;

#[derive(Debug, Default, Clone)]
pub struct GitCli;

#[async_trait]
impl GitClient for GitCli {
    async fn version(&self) -> AppResult<String> {
        match run_ok("git", &["--version"], None, TIMEOUT_MS).await {
            Ok(out) => Ok(out.stdout.trim().to_string()),
            Err(AppError::MissingTool { .. }) => Err(AppError::MissingTool { name: "git".into() }),
            Err(e) => Err(e),
        }
    }

    async fn is_git_repo(&self, path: &str) -> AppResult<bool> {
        let out = run(
            "git",
            &["-C", path, "rev-parse", "--is-inside-work-tree"],
            None,
            TIMEOUT_MS,
        )
        .await?;
        Ok(out.ok() && out.stdout.trim() == "true")
    }

    async fn remote_origin_url(&self, path: &str) -> AppResult<Option<String>> {
        let out = run(
            "git",
            &["-C", path, "remote", "get-url", "origin"],
            None,
            TIMEOUT_MS,
        )
        .await?;
        if out.ok() {
            let url = out.stdout.trim().to_string();
            Ok((!url.is_empty()).then_some(url))
        } else {
            Ok(None)
        }
    }

    async fn current_branch(&self, path: &str) -> AppResult<Option<String>> {
        let out = run(
            "git",
            &["-C", path, "symbolic-ref", "--quiet", "--short", "HEAD"],
            None,
            TIMEOUT_MS,
        )
        .await?;
        if !out.ok() {
            return Ok(None);
        }
        let b = out.stdout.trim().to_string();
        Ok((!b.is_empty()).then_some(b))
    }

    async fn show_file(
        &self,
        repo_path: &str,
        sha: &str,
        file_path: &str,
    ) -> AppResult<Option<String>> {
        let spec = format!("{sha}:{file_path}");
        let out = run("git", &["-C", repo_path, "show", &spec], None, TIMEOUT_MS).await?;
        if !out.ok() {
            // Either the ref is missing locally (`unknown revision`) or the
            // file doesn't exist at that ref. Both are recoverable upstream.
            return Ok(None);
        }
        Ok(Some(out.stdout))
    }

    async fn diff_hunks(
        &self,
        repo_path: &str,
        base: &str,
        head: &str,
        file_path: &str,
    ) -> AppResult<Option<Vec<DiffHunk>>> {
        let range = format!("{base}..{head}");
        let out = run(
            "git",
            &[
                "-C",
                repo_path,
                "diff",
                "--unified=0",
                "--no-color",
                &range,
                "--",
                file_path,
            ],
            None,
            TIMEOUT_MS,
        )
        .await?;
        if !out.ok() {
            let lower = out.stderr.to_ascii_lowercase();
            if lower.contains("unknown revision") || lower.contains("ambiguous argument") {
                return Ok(None);
            }
            return Err(AppError::process(out.stderr.trim().to_string()));
        }
        Ok(Some(parse_hunks(&out.stdout)))
    }
}

/// Parses the head-side hunks from a `git diff --unified=0` output.
/// Looks at `@@ -a,b +c,d @@` headers for the head-line range and at the
/// in-hunk `-` lines to decide between `Added` and `Modified`.
pub(crate) fn parse_hunks(diff: &str) -> Vec<DiffHunk> {
    let mut hunks: Vec<DiffHunk> = Vec::new();
    let mut current: Option<(u32, u32, bool)> = None; // (start, end, has_minus)
    for line in diff.lines() {
        if let Some(rest) = line.strip_prefix("@@ ") {
            // Flush previous hunk before starting a new one.
            if let Some((start, end, has_minus)) = current.take() {
                hunks.push(DiffHunk {
                    start_line: start,
                    end_line: end,
                    kind: if has_minus {
                        HunkKind::Modified
                    } else {
                        HunkKind::Added
                    },
                });
            }
            // `@@ -<a>,<b> +<c>,<d> @@ optional context`
            // We only care about the `+c,d` segment.
            let plus = rest.split_whitespace().find(|s| s.starts_with('+'));
            let Some(plus) = plus else { continue };
            let body = plus.trim_start_matches('+');
            let mut parts = body.splitn(2, ',');
            let start: u32 = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
            let count: u32 = parts.next().and_then(|s| s.parse().ok()).unwrap_or(1);
            // A pure deletion has count=0 — record it at `start`.
            let span = count.max(1);
            current = Some((start.max(1), start.max(1) + span - 1, false));
        } else if line.starts_with('-') && !line.starts_with("---") {
            if let Some(c) = current.as_mut() {
                c.2 = true;
            }
        }
    }
    if let Some((start, end, has_minus)) = current {
        hunks.push(DiffHunk {
            start_line: start,
            end_line: end,
            kind: if has_minus {
                HunkKind::Modified
            } else {
                HunkKind::Added
            },
        });
    }
    hunks
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_added_only_hunk() {
        let diff = "diff --git a/foo b/foo\n--- a/foo\n+++ b/foo\n@@ -0,0 +1,3 @@\n+a\n+b\n+c\n";
        let hunks = parse_hunks(diff);
        assert_eq!(hunks.len(), 1);
        assert_eq!(hunks[0].start_line, 1);
        assert_eq!(hunks[0].end_line, 3);
        assert!(matches!(hunks[0].kind, HunkKind::Added));
    }

    #[test]
    fn parses_modified_hunk_with_minuses() {
        let diff = "@@ -10,2 +10,2 @@\n-old1\n-old2\n+new1\n+new2\n";
        let hunks = parse_hunks(diff);
        assert_eq!(hunks.len(), 1);
        assert_eq!(hunks[0].start_line, 10);
        assert_eq!(hunks[0].end_line, 11);
        assert!(matches!(hunks[0].kind, HunkKind::Modified));
    }

    #[test]
    fn parses_multiple_hunks() {
        let diff = "@@ -1,0 +1,1 @@\n+a\n@@ -10,1 +12,1 @@\n-x\n+y\n";
        let hunks = parse_hunks(diff);
        assert_eq!(hunks.len(), 2);
        assert!(matches!(hunks[0].kind, HunkKind::Added));
        assert!(matches!(hunks[1].kind, HunkKind::Modified));
        assert_eq!(hunks[1].start_line, 12);
        assert_eq!(hunks[1].end_line, 12);
    }
}

use async_trait::async_trait;
use markdown_reviewer_core::domain::{
    ChangeStatus, ChangedFile, PullRequestDetail, PullRequestState, PullRequestSummary,
};
use markdown_reviewer_core::ports::{GhAuthReport, GhClient};
use markdown_reviewer_core::{AppError, AppResult};
use serde::Deserialize;

use crate::process::{redact, run, run_ok};

const TIMEOUT_MS: u64 = 7_000;
const PR_TIMEOUT_MS: u64 = 15_000;
const PR_FILES_TIMEOUT_MS: u64 = 30_000;
// `gh pr list` defaults to 30; bump to a value high enough to cover the
// largest realistic open-PR backlog without paginating ourselves.
const PR_LIST_LIMIT: &str = "200";

const SUMMARY_FIELDS: &str =
    "number,title,author,baseRefName,headRefName,state,isDraft,updatedAt,url";
const DETAIL_FIELDS: &str = "number,title,author,baseRefName,headRefName,state,isDraft,updatedAt,url,body,headRefOid,baseRefOid,additions,deletions,changedFiles";

#[derive(Debug, Default, Clone)]
pub struct GhCli;

#[derive(Debug, Deserialize)]
struct GhAuthor {
    #[serde(default)]
    login: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GhSummary {
    number: u64,
    title: String,
    #[serde(default)]
    author: Option<GhAuthor>,
    base_ref_name: String,
    head_ref_name: String,
    state: String,
    #[serde(default)]
    is_draft: bool,
    updated_at: String,
    url: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GhDetail {
    #[serde(flatten)]
    summary: GhSummary,
    #[serde(default)]
    body: Option<String>,
    head_ref_oid: String,
    base_ref_oid: String,
    additions: u32,
    deletions: u32,
    changed_files: u32,
}

fn parse_state(raw: &str) -> PullRequestState {
    if raw.eq_ignore_ascii_case("MERGED") {
        PullRequestState::Merged
    } else if raw.eq_ignore_ascii_case("CLOSED") {
        PullRequestState::Closed
    } else {
        PullRequestState::Open
    }
}

#[derive(Debug, Deserialize)]
struct GhFile {
    filename: String,
    #[serde(default)]
    previous_filename: Option<String>,
    status: String,
    additions: u32,
    deletions: u32,
}

fn parse_change_status(raw: &str) -> ChangeStatus {
    match raw {
        s if s.eq_ignore_ascii_case("added") => ChangeStatus::Added,
        s if s.eq_ignore_ascii_case("removed") => ChangeStatus::Deleted,
        s if s.eq_ignore_ascii_case("renamed") => ChangeStatus::Renamed,
        s if s.eq_ignore_ascii_case("copied") => ChangeStatus::Copied,
        s if s.eq_ignore_ascii_case("changed") => ChangeStatus::Changed,
        s if s.eq_ignore_ascii_case("unchanged") => ChangeStatus::Unchanged,
        _ => ChangeStatus::Modified,
    }
}

fn into_changed_file(g: GhFile) -> ChangedFile {
    ChangedFile {
        path: g.filename,
        previous_path: g.previous_filename,
        status: parse_change_status(&g.status),
        additions: g.additions,
        deletions: g.deletions,
    }
}

fn into_summary(g: GhSummary) -> PullRequestSummary {
    PullRequestSummary {
        number: g.number,
        title: g.title,
        author: g
            .author
            .and_then(|a| a.login)
            .unwrap_or_else(|| "ghost".into()),
        base_ref: g.base_ref_name,
        head_ref: g.head_ref_name,
        state: parse_state(&g.state),
        is_draft: g.is_draft,
        updated_at: g.updated_at,
        url: g.url,
    }
}

fn is_pr_not_found(stderr_lower: &str) -> bool {
    stderr_lower.contains("could not resolve to a pullrequest")
        || stderr_lower.contains("could not resolve to pullrequest")
        || stderr_lower.contains("no pull requests found")
        || stderr_lower.contains("no pull request found")
}

fn map_gh_error(stderr: &str, number: Option<u64>) -> AppError {
    let lower = stderr.to_ascii_lowercase();
    if let Some(n) = number {
        if is_pr_not_found(&lower) {
            return AppError::PrNotFound { number: n };
        }
    }
    if lower.contains("authentication required") || lower.contains("gh auth login") {
        return AppError::GhNotAuthenticated;
    }
    AppError::process(redact(stderr.trim()))
}

#[async_trait]
impl GhClient for GhCli {
    async fn version(&self) -> AppResult<String> {
        match run_ok("gh", &["--version"], None, TIMEOUT_MS).await {
            Ok(out) => {
                let first = out.stdout.lines().next().unwrap_or("").trim().to_string();
                Ok(first)
            }
            Err(AppError::MissingTool { .. }) => Err(AppError::MissingTool { name: "gh".into() }),
            Err(e) => Err(e),
        }
    }

    async fn auth_status(&self) -> AppResult<GhAuthReport> {
        // `gh auth status` writes to stderr; exit code is non-zero when not logged in.
        let out = run("gh", &["auth", "status"], None, TIMEOUT_MS).await?;
        let text = format!("{}{}", out.stdout, out.stderr);
        let authenticated = out.ok() && text.contains("Logged in to");
        let username = if authenticated {
            text.lines()
                .find_map(|line| line.split("account").nth(1))
                .and_then(|s| s.split_whitespace().next())
                .map(|s| {
                    s.trim_matches(|c: char| !c.is_ascii_alphanumeric() && c != '-')
                        .to_string()
                })
                .filter(|s| !s.is_empty())
        } else {
            None
        };
        Ok(GhAuthReport {
            authenticated,
            username,
            detail: text.trim().to_string(),
        })
    }

    async fn list_pull_requests(&self, repo_path: &str) -> AppResult<Vec<PullRequestSummary>> {
        let out = run(
            "gh",
            &[
                "pr",
                "list",
                "--state",
                "open",
                "--limit",
                PR_LIST_LIMIT,
                "--json",
                SUMMARY_FIELDS,
            ],
            Some(repo_path),
            PR_TIMEOUT_MS,
        )
        .await?;

        if !out.ok() {
            return Err(map_gh_error(&out.stderr, None));
        }

        let parsed: Vec<GhSummary> = serde_json::from_str(out.stdout.trim())
            .map_err(|e| AppError::process(format!("gh pr list: invalid JSON: {e}")))?;
        Ok(parsed.into_iter().map(into_summary).collect())
    }

    async fn load_pull_request(
        &self,
        repo_path: &str,
        number: u64,
    ) -> AppResult<PullRequestDetail> {
        let number_str = number.to_string();
        let out = run(
            "gh",
            &["pr", "view", &number_str, "--json", DETAIL_FIELDS],
            Some(repo_path),
            PR_TIMEOUT_MS,
        )
        .await?;

        if !out.ok() {
            return Err(map_gh_error(&out.stderr, Some(number)));
        }

        let detail: GhDetail = serde_json::from_str(out.stdout.trim())
            .map_err(|e| AppError::process(format!("gh pr view: invalid JSON: {e}")))?;
        let GhDetail {
            summary,
            body,
            head_ref_oid,
            base_ref_oid,
            additions,
            deletions,
            changed_files,
        } = detail;
        Ok(PullRequestDetail {
            head_sha: head_ref_oid,
            base_sha: base_ref_oid,
            additions,
            deletions,
            changed_files,
            body,
            summary: into_summary(summary),
        })
    }

    async fn list_changed_files(
        &self,
        repo_path: &str,
        number: u64,
    ) -> AppResult<Vec<ChangedFile>> {
        // `gh api` infers the repo from the cwd. `--paginate` concatenates pages
        // into a single JSON stream; we parse each one and flatten.
        let endpoint = format!("repos/{{owner}}/{{repo}}/pulls/{number}/files");
        let out = run(
            "gh",
            &[
                "api",
                "-X",
                "GET",
                &endpoint,
                "-F",
                "per_page=100",
                "--paginate",
            ],
            Some(repo_path),
            PR_FILES_TIMEOUT_MS,
        )
        .await?;

        if !out.ok() {
            return Err(map_gh_error(&out.stderr, Some(number)));
        }

        let mut files = Vec::new();
        for chunk in split_json_arrays(out.stdout.trim()) {
            let page: Vec<GhFile> = serde_json::from_str(chunk).map_err(|e| {
                AppError::process(format!("gh api pulls/{number}/files: invalid JSON: {e}"))
            })?;
            files.extend(page.into_iter().map(into_changed_file));
        }
        Ok(files)
    }
}

/// `gh api --paginate` concatenates each page's JSON output back-to-back, so a
/// 250-file PR comes back as `[…][…][…]`. Split on top-level `][` to get one
/// JSON array per page that we can parse independently.
fn split_json_arrays(raw: &str) -> Vec<&str> {
    let raw = raw.trim();
    if raw.is_empty() {
        return Vec::new();
    }
    let mut chunks = Vec::new();
    let mut depth: i32 = 0;
    let mut start = 0;
    let bytes = raw.as_bytes();
    for (i, b) in bytes.iter().enumerate() {
        match b {
            b'[' => depth += 1,
            b']' => {
                depth -= 1;
                if depth == 0 {
                    chunks.push(&raw[start..=i]);
                    // skip whitespace before the next array
                    start = i + 1;
                    while start < bytes.len() && bytes[start].is_ascii_whitespace() {
                        start += 1;
                    }
                }
            }
            _ => {}
        }
    }
    chunks
}

use async_trait::async_trait;
use markdown_reviewer_core::domain::{
    ChangeStatus, ChangedFile, PullRequestDetail, PullRequestState, PullRequestSummary,
};
use markdown_reviewer_core::ports::{GhAuthReport, GhClient, ReviewCommentInput};
use markdown_reviewer_core::{AppError, AppResult};
use serde::Deserialize;

use crate::process::{redact, run, run_ok};

const TIMEOUT_MS: u64 = 7_000;
const PR_TIMEOUT_MS: u64 = 15_000;
const PR_FILES_TIMEOUT_MS: u64 = 30_000;
const REVIEW_SUBMIT_TIMEOUT_MS: u64 = 30_000;
const REVIEW_COMMENT_TIMEOUT_MS: u64 = 15_000;
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

        // `gh api --paginate` concatenates each page's JSON array back-to-back.
        // We use serde_json's streaming Deserializer so it correctly walks
        // string contents, escapes, and nested structures (the `patch` field
        // routinely contains `]`/`[` characters that broke a naive splitter).
        let mut files = Vec::new();
        let stream =
            serde_json::Deserializer::from_str(out.stdout.trim()).into_iter::<Vec<GhFile>>();
        for page in stream {
            let page = page.map_err(|e| {
                AppError::process(format!("gh api pulls/{number}/files: invalid JSON: {e}"))
            })?;
            files.extend(page.into_iter().map(into_changed_file));
        }
        Ok(files)
    }

    async fn get_file_content(
        &self,
        repo_path: &str,
        sha: &str,
        file_path: &str,
    ) -> AppResult<String> {
        // `gh api repos/{owner}/{repo}/contents/{path}?ref=<sha>` returns the
        // file content base64-encoded. We use `--jq` to pull the raw content
        // out and rely on `gh` for owner/repo inference via cwd.
        let endpoint = format!("repos/{{owner}}/{{repo}}/contents/{file_path}?ref={sha}");
        let out = run(
            "gh",
            &["api", "-X", "GET", &endpoint, "--jq", ".content"],
            Some(repo_path),
            PR_TIMEOUT_MS,
        )
        .await?;

        if !out.ok() {
            let lower = out.stderr.to_ascii_lowercase();
            if lower.contains("404") || lower.contains("not found") {
                return Err(AppError::FileNotFound {
                    sha: sha.to_string(),
                    path: file_path.to_string(),
                });
            }
            return Err(AppError::process(redact(out.stderr.trim())));
        }

        // Body is base64 with newlines.
        let raw = out.stdout.replace(['\n', '\r'], "");
        let bytes = base64_decode(&raw)
            .map_err(|e| AppError::process(format!("gh api contents: invalid base64: {e}")))?;
        String::from_utf8(bytes)
            .map_err(|e| AppError::process(format!("gh api contents: invalid UTF-8: {e}")))
    }

    async fn submit_review_batch(
        &self,
        repo_path: &str,
        pr_number: u64,
        head_sha: &str,
        comments: &[ReviewCommentInput],
    ) -> AppResult<Vec<i64>> {
        if comments.is_empty() {
            return Ok(Vec::new());
        }

        // We assemble the call as `gh api -X POST <endpoint> -f field=value`
        // (string) and `-F field=value` (raw / numeric). gh CLI translates
        // bracketed names like `comments[0][path]` into a nested JSON body.
        let endpoint = format!("repos/{{owner}}/{{repo}}/pulls/{pr_number}/reviews");
        let commit_arg = format!("commit_id={head_sha}");

        // Pre-compute owned strings with stable lifetimes for the &str args
        // we hand to `run`. We use `--raw-field` for user-provided string
        // values (path/body/side) so a body starting with `@` (or otherwise
        // matching gh's "@file" sigil) is sent literally instead of being
        // interpreted as a file reference. Numeric line/start_line use `-F`
        // so they land as JSON numbers.
        let owned: Vec<BatchCommentSlot> = comments
            .iter()
            .enumerate()
            .map(|(idx, c)| BatchCommentSlot {
                path: format!("comments[{idx}][path]={}", c.path),
                line: format!("comments[{idx}][line]={}", c.line),
                side: format!("comments[{idx}][side]=RIGHT"),
                body: format!("comments[{idx}][body]={}", c.body),
                start_line: c
                    .start_line
                    .map(|s| format!("comments[{idx}][start_line]={s}")),
                start_side: c
                    .start_line
                    .map(|_| format!("comments[{idx}][start_side]=RIGHT")),
            })
            .collect();

        let mut args: Vec<&str> = vec!["api", "-X", "POST", &endpoint];
        args.push("--raw-field");
        args.push(&commit_arg);
        args.push("--raw-field");
        args.push("event=COMMENT");

        for slot in &owned {
            args.push("--raw-field");
            args.push(&slot.path);
            args.push("-F");
            args.push(&slot.line);
            args.push("--raw-field");
            args.push(&slot.side);
            args.push("--raw-field");
            args.push(&slot.body);
            if let Some(start) = &slot.start_line {
                args.push("-F");
                args.push(start);
            }
            if let Some(start_side) = &slot.start_side {
                args.push("--raw-field");
                args.push(start_side);
            }
        }

        // `--jq '.comments | map(.id)'` extracts the ids in submission order.
        args.push("--jq");
        args.push(".comments | map(.id)");

        let out = run("gh", &args, Some(repo_path), REVIEW_SUBMIT_TIMEOUT_MS).await?;
        if !out.ok() {
            return Err(map_gh_error(&out.stderr, Some(pr_number)));
        }

        let ids: Vec<i64> = serde_json::from_str(out.stdout.trim()).map_err(|e| {
            AppError::process(format!(
                "gh api pulls/{pr_number}/reviews: invalid JSON: {e}"
            ))
        })?;
        if ids.len() != comments.len() {
            return Err(AppError::process(format!(
                "gh api pulls/{pr_number}/reviews: expected {} comment ids, got {}",
                comments.len(),
                ids.len()
            )));
        }
        Ok(ids)
    }

    async fn submit_review_comment(
        &self,
        repo_path: &str,
        pr_number: u64,
        head_sha: &str,
        comment: &ReviewCommentInput,
    ) -> AppResult<i64> {
        let endpoint = format!("repos/{{owner}}/{{repo}}/pulls/{pr_number}/comments");
        let commit_arg = format!("commit_id={head_sha}");
        let path_arg = format!("path={}", comment.path);
        let line_arg = format!("line={}", comment.line);
        let body_arg = format!("body={}", comment.body);
        let start_line_arg = comment.start_line.map(|s| format!("start_line={s}"));

        // `--raw-field` for user-provided strings (commit/path/body/side) so
        // bodies starting with `@` are sent literally instead of being treated
        // as file inputs by gh. `-F` keeps numeric `line`/`start_line` typed.
        let mut args: Vec<&str> = vec![
            "api",
            "-X",
            "POST",
            &endpoint,
            "--raw-field",
            &commit_arg,
            "--raw-field",
            &path_arg,
            "-F",
            &line_arg,
            "--raw-field",
            "side=RIGHT",
            "--raw-field",
            &body_arg,
        ];
        if let Some(arg) = start_line_arg.as_deref() {
            args.push("-F");
            args.push(arg);
            args.push("--raw-field");
            args.push("start_side=RIGHT");
        }
        args.push("--jq");
        args.push(".id");

        let out = run("gh", &args, Some(repo_path), REVIEW_COMMENT_TIMEOUT_MS).await?;
        if !out.ok() {
            return Err(map_gh_error(&out.stderr, Some(pr_number)));
        }

        let id: i64 = out.stdout.trim().parse().map_err(|e| {
            AppError::process(format!(
                "gh api pulls/{pr_number}/comments: invalid id: {e}"
            ))
        })?;
        Ok(id)
    }
}

/// Stable-lifetime owned strings used to assemble each batch-comment entry's
/// `--raw-field` / `-F` argv pair.
struct BatchCommentSlot {
    path: String,
    line: String,
    side: String,
    body: String,
    start_line: Option<String>,
    start_side: Option<String>,
}

/// Minimal base64 decoder for the standard alphabet. Avoids pulling in a new
/// dependency just for the GitHub Contents API fallback path.
fn base64_decode(input: &str) -> Result<Vec<u8>, &'static str> {
    fn val(c: u8) -> Option<u8> {
        match c {
            b'A'..=b'Z' => Some(c - b'A'),
            b'a'..=b'z' => Some(c - b'a' + 26),
            b'0'..=b'9' => Some(c - b'0' + 52),
            b'+' => Some(62),
            b'/' => Some(63),
            _ => None,
        }
    }
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len() * 3 / 4);
    let mut buf: u32 = 0;
    let mut bits: u32 = 0;
    for &c in bytes {
        if c == b'=' {
            break;
        }
        let v = val(c).ok_or("invalid base64 character")?;
        buf = (buf << 6) | u32::from(v);
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push(((buf >> bits) & 0xFF) as u8);
        }
    }
    Ok(out)
}

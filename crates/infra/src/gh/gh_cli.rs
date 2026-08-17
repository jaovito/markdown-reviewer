use async_trait::async_trait;
use markdown_reviewer_core::domain::{
    ChangeStatus, ChangedFile, PullRequestDetail, PullRequestState, PullRequestSummary,
    RemoteRepository,
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

    async fn auth_login(&self) -> AppResult<GhAuthReport> {
        let _ = run(
            "gh",
            &["auth", "login", "--web", "-h", "github.com"],
            None,
            120_000,
        )
        .await;
        self.auth_status().await
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

    async fn get_file_bytes(
        &self,
        repo_path: &str,
        sha: &str,
        file_path: &str,
    ) -> AppResult<Vec<u8>> {
        // Same endpoint as `get_file_content`, but the base64 payload is
        // returned as bytes rather than being forced through UTF-8.
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

        let raw = out.stdout.replace(['\n', '\r'], "");
        base64_decode(&raw)
            .map_err(|e| AppError::process(format!("gh api contents: invalid base64: {e}")))
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

    async fn list_review_threads(
        &self,
        repo_path: &str,
        pr_number: u64,
    ) -> AppResult<markdown_reviewer_core::ports::FetchedReviewThreads> {
        let query_arg = format!("query={}", crate::gh::review_threads::REVIEW_THREADS_QUERY);
        let pr_arg = format!("pr={pr_number}");
        // gh fills `{owner}` / `{repo}` from the cwd when we use `-F owner={owner}` style,
        // but graphql variables need explicit values. `gh api graphql` accepts
        // `-F owner=:owner -F name=:repo` shortcuts that expand against the
        // current repo — use them to avoid a second round-trip. Flags and
        // values stay as separate argv entries (`-F` then `pr=N`) — the
        // `-F=pr=N` single-token form isn't reliably accepted by gh.
        let args: Vec<&str> = vec![
            "api",
            "graphql",
            "-F",
            "owner=:owner",
            "-F",
            "name=:repo",
            "-F",
            &pr_arg,
            "--raw-field",
            &query_arg,
        ];
        let out = run("gh", &args, Some(repo_path), PR_TIMEOUT_MS).await?;
        if !out.ok() {
            return Err(map_gh_error(&out.stderr, Some(pr_number)));
        }
        crate::gh::review_threads::parse_review_threads(out.stdout.trim())
    }

    async fn reply_review_comment(
        &self,
        repo_path: &str,
        pr_number: u64,
        in_reply_to_comment_id: i64,
        body: &str,
    ) -> AppResult<markdown_reviewer_core::domain::RemoteComment> {
        let endpoint = format!("repos/{{owner}}/{{repo}}/pulls/{pr_number}/comments");
        let in_reply_arg = format!("in_reply_to={in_reply_to_comment_id}");
        let body_arg = format!("body={body}");
        let args = vec![
            "api",
            "-X",
            "POST",
            &endpoint,
            "-F",
            &in_reply_arg,
            "--raw-field",
            &body_arg,
        ];
        let out = run("gh", &args, Some(repo_path), REVIEW_COMMENT_TIMEOUT_MS).await?;
        if !out.ok() {
            return Err(classify_rest_error(&out.stderr));
        }
        parse_review_comment(out.stdout.trim())
    }

    async fn edit_review_comment(
        &self,
        repo_path: &str,
        comment_id: i64,
        body: &str,
    ) -> AppResult<markdown_reviewer_core::domain::RemoteComment> {
        let endpoint = format!("repos/{{owner}}/{{repo}}/pulls/comments/{comment_id}");
        let body_arg = format!("body={body}");
        let args = vec!["api", "-X", "PATCH", &endpoint, "--raw-field", &body_arg];
        let out = run("gh", &args, Some(repo_path), REVIEW_COMMENT_TIMEOUT_MS).await?;
        if !out.ok() {
            return Err(classify_rest_error(&out.stderr));
        }
        parse_review_comment(out.stdout.trim())
    }

    async fn delete_review_comment(&self, repo_path: &str, comment_id: i64) -> AppResult<()> {
        let endpoint = format!("repos/{{owner}}/{{repo}}/pulls/comments/{comment_id}");
        let args = vec!["api", "-X", "DELETE", &endpoint];
        let out = run("gh", &args, Some(repo_path), REVIEW_COMMENT_TIMEOUT_MS).await?;
        if !out.ok() {
            return Err(classify_rest_error(&out.stderr));
        }
        Ok(())
    }

    async fn resolve_review_thread(
        &self,
        repo_path: &str,
        thread_id: &str,
    ) -> AppResult<markdown_reviewer_core::domain::RemoteThread> {
        run_thread_mutation(
            repo_path,
            thread_id,
            "mutation($id: ID!) { resolveReviewThread(input: { threadId: $id }) { thread { id } } }",
        )
        .await?;
        refetch_thread(repo_path, thread_id).await
    }

    async fn unresolve_review_thread(
        &self,
        repo_path: &str,
        thread_id: &str,
    ) -> AppResult<markdown_reviewer_core::domain::RemoteThread> {
        run_thread_mutation(
            repo_path,
            thread_id,
            "mutation($id: ID!) { unresolveReviewThread(input: { threadId: $id }) { thread { id } } }",
        )
        .await?;
        refetch_thread(repo_path, thread_id).await
    }

    async fn list_user_repositories(
        &self,
        query: Option<&str>,
        limit: u32,
    ) -> AppResult<Vec<RemoteRepository>> {
        let limit_str = limit.to_string();
        let fields = "name,nameWithOwner,description,url,isPrivate,isFork,stargazerCount,updatedAt,primaryLanguage,defaultBranchRef";
        let args = vec!["repo", "list", "--json", fields, "--limit", &limit_str];
        let out = run("gh", &args, None, PR_FILES_TIMEOUT_MS).await?;
        if !out.ok() {
            return Err(AppError::process(out.stderr));
        }
        let items: Vec<GhRepoItem> = serde_json::from_str(out.stdout.trim())
            .map_err(|e| AppError::process(format!("Failed to parse gh repo list output: {e}")))?;
        let mut result: Vec<_> = items
            .into_iter()
            .map(|item| RemoteRepository {
                name: item.name,
                name_with_owner: item.name_with_owner,
                description: item.description,
                url: item.url,
                is_private: item.is_private,
                is_fork: item.is_fork,
                stargazer_count: item.stargazer_count,
                updated_at: item.updated_at,
                primary_language: item.primary_language.map(|l| l.name),
                default_branch: item
                    .default_branch_ref
                    .map(|b| b.name)
                    .unwrap_or_else(|| "main".to_string()),
            })
            .collect();

        if let Some(q) = query {
            let q_lower = q.to_lowercase();
            if !q_lower.is_empty() {
                result.retain(|r| {
                    r.name.to_lowercase().contains(&q_lower)
                        || r.name_with_owner.to_lowercase().contains(&q_lower)
                        || r.description.to_lowercase().contains(&q_lower)
                });
            }
        }
        Ok(result)
    }

    async fn clone_repository(
        &self,
        repo_name_with_owner: &str,
        target_dir: &str,
    ) -> AppResult<()> {
        let args = vec![
            "repo",
            "clone",
            repo_name_with_owner,
            target_dir,
            "--",
            "--progress",
        ];
        let out = run("gh", &args, None, 300_000).await?;
        if !out.ok() {
            return Err(AppError::process(format!(
                "Failed to clone repository: {}",
                out.stderr
            )));
        }
        Ok(())
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GhRepoPrimaryLanguage {
    name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GhRepoDefaultBranchRef {
    name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GhRepoItem {
    name: String,
    name_with_owner: String,
    #[serde(default)]
    description: String,
    url: String,
    #[serde(default)]
    is_private: bool,
    #[serde(default)]
    is_fork: bool,
    #[serde(default)]
    stargazer_count: u32,
    #[serde(default)]
    updated_at: String,
    primary_language: Option<GhRepoPrimaryLanguage>,
    default_branch_ref: Option<GhRepoDefaultBranchRef>,
}

fn classify_rest_error(stderr: &str) -> AppError {
    let lower = stderr.to_ascii_lowercase();
    if lower.contains("status code: 403")
        || lower.contains("must have write access")
        || lower.contains("must be the author")
    {
        return AppError::validation("read-only on GitHub");
    }
    if lower.contains("status code: 404") || lower.contains("not found") {
        return AppError::validation("upstream thread no longer exists");
    }
    if lower.contains("authentication required") || lower.contains("gh auth login") {
        return AppError::GhNotAuthenticated;
    }
    AppError::process(redact(stderr.trim()))
}

fn parse_review_comment(raw: &str) -> AppResult<markdown_reviewer_core::domain::RemoteComment> {
    #[derive(serde::Deserialize)]
    struct UserField {
        login: String,
        avatar_url: Option<String>,
    }
    #[derive(serde::Deserialize)]
    struct RawComment {
        id: i64,
        user: Option<UserField>,
        body: String,
        created_at: String,
        updated_at: String,
        html_url: String,
        #[serde(default)]
        author_association: Option<String>,
    }
    let c: RawComment = serde_json::from_str(raw)
        .map_err(|e| AppError::process(format!("gh api comments: invalid JSON: {e}")))?;
    // The REST POST/PATCH/reply responses don't carry `viewerCanUpdate`, so we
    // infer it from `author_association`. This over-reports for non-author
    // team members, but in practice this parser only runs against responses
    // to OUR mutations (reply/edit), where the viewer IS the author and the
    // permission is always true. The next refresh round-trip pulls the
    // authoritative `viewerCan*` flags via GraphQL `list_review_threads`.
    let viewer_can_update = matches!(
        c.author_association.as_deref(),
        Some("OWNER" | "MEMBER" | "COLLABORATOR" | "CONTRIBUTOR")
    );
    let (author, avatar) = match c.user {
        Some(u) => (u.login, u.avatar_url),
        None => ("ghost".into(), None),
    };
    Ok(markdown_reviewer_core::domain::RemoteComment {
        comment_id: c.id,
        author,
        author_avatar_url: avatar,
        body: c.body,
        created_at: c.created_at,
        updated_at: c.updated_at,
        viewer_can_update,
        viewer_can_delete: viewer_can_update,
        html_url: c.html_url,
    })
}

async fn run_thread_mutation(repo_path: &str, thread_id: &str, mutation: &str) -> AppResult<()> {
    let query_arg = format!("query={mutation}");
    let id_arg = format!("id={thread_id}");
    let args = vec![
        "api",
        "graphql",
        "--raw-field",
        &query_arg,
        "--raw-field",
        &id_arg,
    ];
    let out = run("gh", &args, Some(repo_path), REVIEW_COMMENT_TIMEOUT_MS).await?;
    if !out.ok() {
        return Err(classify_rest_error(&out.stderr));
    }
    if out.stdout.contains("\"errors\":") {
        return Err(AppError::process(format!(
            "graphql mutation failed: {}",
            redact(out.stdout.trim())
        )));
    }
    Ok(())
}

#[derive(serde::Deserialize)]
struct NodeEnvelope {
    data: NodeData,
}
#[derive(serde::Deserialize)]
struct NodeData {
    node: serde_json::Value,
}

async fn refetch_thread(
    repo_path: &str,
    thread_id: &str,
) -> AppResult<markdown_reviewer_core::domain::RemoteThread> {
    use markdown_reviewer_core::domain::MappingStatus;
    let single_query = r"query($id: ID!) { node(id: $id) { ... on PullRequestReviewThread {
            id path originalLine originalStartLine line startLine
            isOutdated isResolved viewerCanResolve viewerCanUnresolve
            comments(first: 100) { nodes {
                databaseId author { login avatarUrl } body createdAt updatedAt
                viewerCanUpdate viewerCanDelete url originalCommit { oid }
            } }
        } } }";
    let q_arg = format!("query={single_query}");
    let id_arg = format!("id={thread_id}");
    let args = vec![
        "api",
        "graphql",
        "--raw-field",
        &q_arg,
        "--raw-field",
        &id_arg,
    ];
    let out = run("gh", &args, Some(repo_path), REVIEW_COMMENT_TIMEOUT_MS).await?;
    if !out.ok() {
        return Err(classify_rest_error(&out.stderr));
    }
    let env: NodeEnvelope = serde_json::from_str(out.stdout.trim())
        .map_err(|e| AppError::process(format!("gh graphql node: {e}")))?;
    // Wrap the single node in the multi-thread envelope so we can reuse
    // `parse_review_threads` instead of duplicating its serde scaffolding.
    // If that parser grows assumptions specific to the list query, this
    // call-site is the one to revisit.
    let wrapped = serde_json::json!({
        "data": {
            "repository": {
                "pullRequest": {
                    "reviewThreads": {
                        "pageInfo": { "hasNextPage": false, "endCursor": null },
                        "nodes": [env.data.node]
                    }
                }
            }
        }
    });
    let fetched = crate::gh::review_threads::parse_review_threads(&wrapped.to_string())?;
    let mut thread = fetched
        .threads
        .into_iter()
        .next()
        .ok_or_else(|| AppError::process("graphql node returned no thread"))?;
    thread.mapping_status = MappingStatus::Mapped;
    Ok(thread)
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

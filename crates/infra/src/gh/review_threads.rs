//! Parses the GraphQL `reviewThreads` payload returned by
//! `gh api graphql -F query=…`. Stays self-contained so a fixture-based
//! test can run without going through the gh CLI.

use markdown_reviewer_core::domain::{
    MappingStatus, RemoteComment, RemoteThread, ThreadState,
};
use markdown_reviewer_core::ports::FetchedReviewThreads;
use markdown_reviewer_core::{AppError, AppResult};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct Envelope {
    data: Data,
}

#[derive(Debug, Deserialize)]
struct Data {
    repository: Repo,
}

#[derive(Debug, Deserialize)]
struct Repo {
    #[serde(rename = "pullRequest")]
    pull_request: Pr,
}

#[derive(Debug, Deserialize)]
struct Pr {
    #[serde(rename = "reviewThreads")]
    review_threads: Threads,
}

#[derive(Debug, Deserialize)]
struct Threads {
    #[serde(rename = "pageInfo")]
    page_info: PageInfo,
    nodes: Vec<ThreadNode>,
}

#[derive(Debug, Deserialize)]
struct PageInfo {
    #[serde(rename = "hasNextPage")]
    has_next_page: bool,
}

#[allow(clippy::struct_excessive_bools)]
#[derive(Debug, Deserialize)]
struct ThreadNode {
    id: String,
    path: String,
    #[serde(rename = "originalLine")]
    original_line: u32,
    #[serde(rename = "originalStartLine")]
    original_start_line: Option<u32>,
    line: Option<u32>,
    #[serde(rename = "startLine")]
    start_line: Option<u32>,
    #[serde(rename = "isOutdated")]
    is_outdated: bool,
    #[serde(rename = "isResolved")]
    is_resolved: bool,
    #[serde(rename = "viewerCanResolve")]
    viewer_can_resolve: bool,
    #[serde(rename = "viewerCanUnresolve")]
    viewer_can_unresolve: bool,
    comments: Comments,
}

#[derive(Debug, Deserialize)]
struct Comments {
    nodes: Vec<CommentNode>,
}

#[derive(Debug, Deserialize)]
struct CommentNode {
    #[serde(rename = "databaseId")]
    database_id: i64,
    author: Option<Author>,
    body: String,
    #[serde(rename = "createdAt")]
    created_at: String,
    #[serde(rename = "updatedAt")]
    updated_at: String,
    #[serde(rename = "viewerCanUpdate")]
    viewer_can_update: bool,
    #[serde(rename = "viewerCanDelete")]
    viewer_can_delete: bool,
    url: String,
    #[serde(rename = "originalCommit")]
    original_commit: Option<Commit>,
}

#[derive(Debug, Deserialize)]
struct Author {
    login: String,
    #[serde(rename = "avatarUrl")]
    avatar_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct Commit {
    oid: String,
}

pub fn parse_review_threads(raw: &str) -> AppResult<FetchedReviewThreads> {
    let env: Envelope = serde_json::from_str(raw)
        .map_err(|e| AppError::process(format!("gh api graphql reviewThreads: {e}")))?;
    let truncated = env
        .data
        .repository
        .pull_request
        .review_threads
        .page_info
        .has_next_page;
    let threads = env
        .data
        .repository
        .pull_request
        .review_threads
        .nodes
        .into_iter()
        .map(into_thread)
        .collect();
    Ok(FetchedReviewThreads { threads, truncated })
}

fn into_thread(n: ThreadNode) -> RemoteThread {
    // Original commit is taken from the *first* comment's `originalCommit.oid`
    // — GraphQL doesn't expose it directly on the thread. Empty when missing
    // (degenerate payload); the mapping layer will fall through to LineMoved.
    let original_commit_id = n
        .comments
        .nodes
        .first()
        .and_then(|c| c.original_commit.as_ref())
        .map(|c| c.oid.clone())
        .unwrap_or_default();

    let comments = n.comments.nodes.into_iter().map(into_comment).collect();
    RemoteThread {
        thread_id: n.id,
        path: n.path,
        original_commit_id,
        line: n.line,
        start_line: n.start_line,
        original_line: n.original_line,
        original_start_line: n.original_start_line,
        state: if n.is_resolved {
            ThreadState::Resolved
        } else {
            ThreadState::Open
        },
        is_outdated: n.is_outdated,
        viewer_can_resolve: n.viewer_can_resolve,
        viewer_can_unresolve: n.viewer_can_unresolve,
        comments,
        anchor: None,
        mapping_status: MappingStatus::Mapped, // overwritten by map_anchor
    }
}

fn into_comment(c: CommentNode) -> RemoteComment {
    let (author, avatar) = match c.author {
        Some(a) => (a.login, a.avatar_url),
        None => ("ghost".into(), None),
    };
    RemoteComment {
        comment_id: c.database_id,
        author,
        author_avatar_url: avatar,
        body: c.body,
        created_at: c.created_at,
        updated_at: c.updated_at,
        viewer_can_update: c.viewer_can_update,
        viewer_can_delete: c.viewer_can_delete,
        html_url: c.url,
    }
}

/// Static GraphQL query used by both `list_review_threads` and the
/// post-mutation refetch helpers. Variables: `$owner: String!`,
/// `$name: String!`, `$pr: Int!`.
pub const REVIEW_THREADS_QUERY: &str = r"
query($owner: String!, $name: String!, $pr: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $pr) {
      reviewThreads(first: 100) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          path
          originalLine
          originalStartLine
          line
          startLine
          isOutdated
          isResolved
          viewerCanResolve
          viewerCanUnresolve
          comments(first: 100) {
            nodes {
              databaseId
              author { login avatarUrl }
              body
              createdAt
              updatedAt
              viewerCanUpdate
              viewerCanDelete
              url
              originalCommit { oid }
            }
          }
        }
      }
    }
  }
}
";

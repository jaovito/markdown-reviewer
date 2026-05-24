//! Refresh + map + cache pipeline. Always hits the network — caller is
//! responsible for invalidating React Query / `SQLite` cache as needed.

use crate::domain::{MappingStatus, RefreshResult, RemoteThread};
use crate::ports::CachedRefresh;
use crate::AppResult;

use super::{mapping::map_anchor, Sync};

pub async fn run(
    svc: &Sync,
    repo_path: &str,
    pr_number: u64,
    head_sha: &str,
) -> AppResult<RefreshResult> {
    let fetched = svc.gh.list_review_threads(repo_path, pr_number).await?;
    let mut mapped: Vec<RemoteThread> = Vec::new();
    let mut unmapped: Vec<RemoteThread> = Vec::new();

    for mut thread in fetched.threads {
        let (anchor, status) = map_anchor(&thread, head_sha, repo_path, svc.files.as_ref()).await;
        thread.anchor = anchor;
        thread.mapping_status = status.clone();
        if matches!(status, MappingStatus::Mapped) && thread.anchor.is_some() {
            mapped.push(thread);
        } else {
            unmapped.push(thread);
        }
    }

    // Deterministic ordering: file path, then start line, then thread id.
    mapped.sort_by(|a, b| {
        let a_line = a
            .anchor
            .as_ref()
            .map_or(0, crate::domain::comment::CommentAnchor::start_line);
        let b_line = b
            .anchor
            .as_ref()
            .map_or(0, crate::domain::comment::CommentAnchor::start_line);
        a.path
            .cmp(&b.path)
            .then(a_line.cmp(&b_line))
            .then(a.thread_id.cmp(&b.thread_id))
    });
    unmapped.sort_by(|a, b| a.path.cmp(&b.path).then(a.thread_id.cmp(&b.thread_id)));

    let refreshed_at_ms = svc.clock.now_unix_ms();
    let cached = CachedRefresh {
        head_sha: head_sha.to_string(),
        refreshed_at_ms,
        threads: mapped.clone(),
        unmapped: unmapped.clone(),
    };
    svc.store
        .put(repo_path, pr_number, head_sha, &cached)
        .await?;

    if fetched.truncated {
        tracing::warn!(
            pr_number,
            "list_review_threads truncated at 100 threads — pagination not yet implemented"
        );
    }

    Ok(RefreshResult {
        threads: mapped,
        unmapped,
        refreshed_at_ms,
    })
}

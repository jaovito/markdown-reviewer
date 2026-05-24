//! Read-only hydration helper for the per-PR remote-thread cache.

use crate::domain::RefreshResult;
use crate::AppResult;

use super::Sync;

pub async fn get_cached(
    svc: &Sync,
    repo_path: &str,
    pr_number: u64,
) -> AppResult<Option<RefreshResult>> {
    let row = svc.store.get(repo_path, pr_number).await?;
    Ok(row.map(|c| c.into_refresh_result()))
}

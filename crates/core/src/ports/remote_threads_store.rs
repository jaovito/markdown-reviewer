use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use crate::domain::{RefreshResult, RemoteThread};
use crate::AppResult;

/// Snapshot returned by `RemoteThreadsStore::get`. Carries the head sha we
/// were anchored to so the UI can warn when the cache predates the current
/// head.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CachedRefresh {
    pub head_sha: String,
    pub refreshed_at_ms: i64,
    pub threads: Vec<RemoteThread>,
    pub unmapped: Vec<RemoteThread>,
}

impl CachedRefresh {
    pub fn into_refresh_result(self) -> RefreshResult {
        RefreshResult {
            threads: self.threads,
            unmapped: self.unmapped,
            refreshed_at_ms: self.refreshed_at_ms,
        }
    }
}

#[async_trait]
pub trait RemoteThreadsStore: Send + Sync {
    /// Reads the cached payload for `(repo_path, pr_number)`. Returns
    /// `Ok(None)` when no row exists yet.
    async fn get(&self, repo_path: &str, pr_number: u64) -> AppResult<Option<CachedRefresh>>;

    /// Writes the cache row, replacing any previous entry for the same
    /// `(repo_path, pr_number)`. Called from `application::sync::refresh`
    /// after a successful round-trip.
    async fn put(
        &self,
        repo_path: &str,
        pr_number: u64,
        head_sha: &str,
        cached: &CachedRefresh,
    ) -> AppResult<()>;
}

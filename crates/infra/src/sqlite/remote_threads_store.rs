use async_trait::async_trait;
use markdown_reviewer_core::ports::{CachedRefresh, RemoteThreadsStore};
use markdown_reviewer_core::{AppError, AppResult};
use rusqlite::params;

use super::Db;

pub struct SqliteRemoteThreadsStore {
    db: Db,
}

impl SqliteRemoteThreadsStore {
    pub fn new(db: Db) -> Self {
        Self { db }
    }
}

#[derive(serde::Serialize, serde::Deserialize)]
struct Payload {
    threads: Vec<markdown_reviewer_core::domain::RemoteThread>,
    unmapped: Vec<markdown_reviewer_core::domain::RemoteThread>,
}

#[async_trait]
impl RemoteThreadsStore for SqliteRemoteThreadsStore {
    async fn get(&self, repo_path: &str, pr_number: u64) -> AppResult<Option<CachedRefresh>> {
        let db = self.db.clone();
        let pr_signed = i64::try_from(pr_number).unwrap_or(i64::MAX);
        let repo = repo_path.to_string();
        tokio::task::spawn_blocking(move || {
            let conn = db.lock().map_err(|e| AppError::db(e.to_string()))?;
            // Match `QueryReturnedNoRows` explicitly — any other rusqlite
            // error (schema mismatch, locked DB, corruption) propagates as
            // `AppError::Db` so the UI can show something useful instead
            // of silently treating it as an empty cache.
            let row = match conn.query_row(
                "SELECT head_sha, refreshed_at_ms, payload_json \
                     FROM remote_threads_cache \
                     WHERE repo_path = ?1 AND pr_number = ?2",
                params![repo, pr_signed],
                |r| {
                    Ok((
                        r.get::<_, String>(0)?,
                        r.get::<_, i64>(1)?,
                        r.get::<_, String>(2)?,
                    ))
                },
            ) {
                Ok(row) => Some(row),
                Err(rusqlite::Error::QueryReturnedNoRows) => None,
                Err(e) => return Err(AppError::db(e)),
            };
            let Some((head_sha, refreshed_at_ms, payload_json)) = row else {
                return Ok::<_, AppError>(None);
            };
            let payload: Payload = serde_json::from_str(&payload_json)
                .map_err(|e| AppError::db(format!("cache payload corrupt: {e}")))?;
            Ok(Some(CachedRefresh {
                head_sha,
                refreshed_at_ms,
                threads: payload.threads,
                unmapped: payload.unmapped,
            }))
        })
        .await
        .map_err(AppError::unexpected)?
    }

    async fn put(
        &self,
        repo_path: &str,
        pr_number: u64,
        head_sha: &str,
        cached: &CachedRefresh,
    ) -> AppResult<()> {
        let db = self.db.clone();
        let pr_signed = i64::try_from(pr_number).unwrap_or(i64::MAX);
        let repo = repo_path.to_string();
        let head = head_sha.to_string();
        let refreshed = cached.refreshed_at_ms;
        let payload = Payload {
            threads: cached.threads.clone(),
            unmapped: cached.unmapped.clone(),
        };
        let json = serde_json::to_string(&payload)
            .map_err(|e| AppError::db(format!("cache payload serialize: {e}")))?;
        tokio::task::spawn_blocking(move || {
            let conn = db.lock().map_err(|e| AppError::db(e.to_string()))?;
            conn.execute(
                "INSERT INTO remote_threads_cache(repo_path, pr_number, head_sha, refreshed_at_ms, payload_json) \
                 VALUES (?1, ?2, ?3, ?4, ?5) \
                 ON CONFLICT(repo_path, pr_number) DO UPDATE SET \
                    head_sha = excluded.head_sha, \
                    refreshed_at_ms = excluded.refreshed_at_ms, \
                    payload_json = excluded.payload_json",
                params![repo, pr_signed, head, refreshed, json],
            )
            .map_err(AppError::db)?;
            Ok(())
        })
        .await
        .map_err(AppError::unexpected)?
    }
}

use async_trait::async_trait;
use markdown_reviewer_core::ports::{RecentRepository, RecentsStore};
use markdown_reviewer_core::{AppError, AppResult};

use super::Db;

pub struct SqliteRecentsStore {
    db: Db,
}

impl SqliteRecentsStore {
    pub fn new(db: Db) -> Self {
        Self { db }
    }
}

#[async_trait]
impl RecentsStore for SqliteRecentsStore {
    async fn list(&self) -> AppResult<Vec<RecentRepository>> {
        let db = self.db.clone();
        tokio::task::spawn_blocking(move || {
            let conn = db.lock().map_err(|e| AppError::db(e.to_string()))?;
            let mut stmt = conn
                .prepare(
                    "SELECT path, label, remote_url, owner, repo, last_opened_at
                     FROM recent_repositories
                     ORDER BY last_opened_at DESC",
                )
                .map_err(AppError::db)?;
            let rows = stmt
                .query_map([], |row| {
                    Ok(RecentRepository {
                        path: row.get(0)?,
                        label: row.get(1)?,
                        remote_url: row.get(2)?,
                        owner: row.get(3)?,
                        repo: row.get(4)?,
                        last_opened_at: row.get(5)?,
                    })
                })
                .map_err(AppError::db)?;
            let mut out = Vec::new();
            for r in rows {
                out.push(r.map_err(AppError::db)?);
            }
            Ok(out)
        })
        .await
        .map_err(AppError::unexpected)?
    }

    async fn upsert(&self, entry: RecentRepository) -> AppResult<()> {
        let db = self.db.clone();
        tokio::task::spawn_blocking(move || {
            let conn = db.lock().map_err(|e| AppError::db(e.to_string()))?;
            conn.execute(
                "INSERT INTO recent_repositories(path, label, remote_url, owner, repo, last_opened_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                 ON CONFLICT(path) DO UPDATE SET
                    label = excluded.label,
                    remote_url = excluded.remote_url,
                    owner = excluded.owner,
                    repo = excluded.repo,
                    last_opened_at = excluded.last_opened_at",
                rusqlite::params![
                    entry.path,
                    entry.label,
                    entry.remote_url,
                    entry.owner,
                    entry.repo,
                    entry.last_opened_at,
                ],
            )
            .map_err(AppError::db)?;
            Ok::<_, AppError>(())
        })
        .await
        .map_err(AppError::unexpected)?
    }

    async fn remove(&self, path: &str) -> AppResult<()> {
        let db = self.db.clone();
        let owned = path.to_string();
        tokio::task::spawn_blocking(move || {
            let conn = db.lock().map_err(|e| AppError::db(e.to_string()))?;
            conn.execute(
                "DELETE FROM recent_repositories WHERE path = ?1",
                rusqlite::params![owned],
            )
            .map_err(AppError::db)?;
            Ok::<_, AppError>(())
        })
        .await
        .map_err(AppError::unexpected)?
    }
}

use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use crate::AppResult;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RecentRepository {
    pub path: String,
    pub label: String,
    pub remote_url: Option<String>,
    pub owner: Option<String>,
    pub repo: Option<String>,
    pub last_opened_at: i64,
}

#[async_trait]
pub trait RecentsStore: Send + Sync {
    async fn list(&self) -> AppResult<Vec<RecentRepository>>;
    async fn upsert(&self, entry: RecentRepository) -> AppResult<()>;
    async fn remove(&self, path: &str) -> AppResult<()>;
}

use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use crate::AppResult;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GhAuthReport {
    pub authenticated: bool,
    pub username: Option<String>,
    pub detail: String,
}

/// Abstracts the GitHub CLI (`gh`).
#[async_trait]
pub trait GhClient: Send + Sync {
    async fn version(&self) -> AppResult<String>;
    async fn auth_status(&self) -> AppResult<GhAuthReport>;
}

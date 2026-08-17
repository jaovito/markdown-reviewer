use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RemoteRepository {
    pub name: String,
    pub name_with_owner: String,
    pub description: String,
    pub url: String,
    pub is_private: bool,
    pub is_fork: bool,
    pub stargazer_count: u32,
    pub updated_at: String,
    pub primary_language: Option<String>,
    pub default_branch: String,
}

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ToolStatus {
    pub git: ToolCheck,
    pub gh: ToolCheck,
    pub gh_auth: ToolCheck,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum ToolCheck {
    Ok { detail: String },
    Missing { hint: String },
    NotAuthenticated { hint: String },
    Error { message: String },
}

impl ToolCheck {
    pub fn ok(detail: impl Into<String>) -> Self {
        Self::Ok { detail: detail.into() }
    }
    pub fn missing(hint: impl Into<String>) -> Self {
        Self::Missing { hint: hint.into() }
    }
    pub fn not_authenticated(hint: impl Into<String>) -> Self {
        Self::NotAuthenticated { hint: hint.into() }
    }
    pub fn error(message: impl Into<String>) -> Self {
        Self::Error { message: message.into() }
    }
    pub fn is_ok(&self) -> bool {
        matches!(self, Self::Ok { .. })
    }
}

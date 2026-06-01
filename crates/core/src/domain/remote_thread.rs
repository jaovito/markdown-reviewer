//! Domain types for remote-originating PR review threads (Phase 6).
//! GitHub returns line numbers as a mix of `int?` (current position) and
//! `int!` (original position). We mirror that here so the mapping layer
//! can decide what to do without re-fetching.

use serde::{Deserialize, Serialize};

use super::CommentAnchor;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ThreadState {
    Open,
    Resolved,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum MappingStatus {
    Mapped,
    Outdated { reason: String },
    FileMissing,
    LineMoved,
    Ambiguous,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteComment {
    pub comment_id: i64,
    pub author: String,
    pub author_avatar_url: Option<String>,
    pub body: String,
    /// RFC3339 strings; the UI does its own formatting.
    pub created_at: String,
    pub updated_at: String,
    pub viewer_can_update: bool,
    pub viewer_can_delete: bool,
    pub html_url: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteThread {
    /// GraphQL node id of the review thread. Required by resolve/unresolve.
    pub thread_id: String,
    pub path: String,
    pub original_commit_id: String,
    pub line: Option<u32>,
    pub start_line: Option<u32>,
    pub original_line: u32,
    pub original_start_line: Option<u32>,
    pub state: ThreadState,
    pub is_outdated: bool,
    pub viewer_can_resolve: bool,
    pub viewer_can_unresolve: bool,
    pub comments: Vec<RemoteComment>,
    pub anchor: Option<CommentAnchor>,
    pub mapping_status: MappingStatus,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RefreshResult {
    /// Threads with `mapping_status == Mapped` and `anchor.is_some()`.
    pub threads: Vec<RemoteThread>,
    /// Threads we couldn't safely anchor; preserved for the #34 panel.
    pub unmapped: Vec<RemoteThread>,
    pub refreshed_at_ms: i64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mapping_status_serializes_with_kind_tag() {
        let json = serde_json::to_string(&MappingStatus::Outdated {
            reason: "github_outdated".into(),
        })
        .unwrap();
        assert!(json.contains("\"kind\":\"outdated\""));
        assert!(json.contains("\"reason\":\"github_outdated\""));
    }

    #[test]
    fn thread_state_round_trips() {
        let raw = serde_json::to_string(&ThreadState::Resolved).unwrap();
        assert_eq!(raw, "\"resolved\"");
        let back: ThreadState = serde_json::from_str(&raw).unwrap();
        assert_eq!(back, ThreadState::Resolved);
    }
}

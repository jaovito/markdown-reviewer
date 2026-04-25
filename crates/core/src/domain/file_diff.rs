use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum HunkKind {
    /// Range exists only in head (no `-` lines in the hunk).
    Added,
    /// Range exists in both base and head and was edited.
    Modified,
}

/// Continuous range of head-side lines that changed in the PR. `start_line`
/// and `end_line` are 1-based, inclusive. Phase 3 anchors comments on this
/// shape, so keep it stable.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffHunk {
    pub start_line: u32,
    pub end_line: u32,
    pub kind: HunkKind,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDiff {
    pub file_path: String,
    pub head_sha: String,
    pub base_sha: String,
    pub hunks: Vec<DiffHunk>,
}

use serde::{Deserialize, Serialize};

/// Lifecycle of a review comment.
///
/// `Draft`     — local-only, not yet sent to GitHub.
/// `Submitted` — published to GitHub (`github_id` is `Some`).
/// `Hidden`    — kept locally but suppressed in default views.
/// `Resolved`  — marked done by the reviewer.
/// `Deleted`   — soft-deleted; rows remain so historical anchors can survive.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CommentState {
    Draft,
    Submitted,
    Hidden,
    Resolved,
    Deleted,
}

impl CommentState {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Draft => "draft",
            Self::Submitted => "submitted",
            Self::Hidden => "hidden",
            Self::Resolved => "resolved",
            Self::Deleted => "deleted",
        }
    }

    #[allow(clippy::should_implement_trait)]
    pub fn from_str(raw: &str) -> Option<Self> {
        match raw {
            "draft" => Some(Self::Draft),
            "submitted" => Some(Self::Submitted),
            "hidden" => Some(Self::Hidden),
            "resolved" => Some(Self::Resolved),
            "deleted" => Some(Self::Deleted),
            _ => None,
        }
    }

    /// Returns whether `next` is reachable from `self`. Used to guard updates
    /// in `application::comments::update`. `Deleted` is terminal — every
    /// other transition is enumerated here.
    pub fn can_transition_to(self, next: Self) -> bool {
        use CommentState::{Deleted, Draft, Hidden, Resolved, Submitted};
        if self == next {
            return true;
        }
        matches!(
            (self, next),
            (Draft | Resolved, Submitted | Hidden | Deleted)
                | (Submitted, Resolved | Hidden | Deleted)
                | (Hidden, Draft | Submitted | Resolved | Deleted)
        )
    }
}

/// How a comment is anchored to source-document lines.
///
/// Lines are 1-indexed and refer to positions in the file at `head_sha`.
/// The `kind` discriminator is rendered as `lineRange`, `singleLine`,
/// `codeBlock` to match the frontend contract.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum CommentAnchor {
    SingleLine {
        line: u32,
    },
    LineRange {
        start_line: u32,
        end_line: u32,
    },
    /// Selection that lives entirely inside a code block. `code_start_line`
    /// is the line where the fenced block begins; the start/end lines are
    /// 1-indexed lines *within the source file* (not the block).
    CodeBlock {
        start_line: u32,
        end_line: u32,
        code_start_line: u32,
    },
}

impl CommentAnchor {
    pub fn start_line(&self) -> u32 {
        match self {
            Self::SingleLine { line } => *line,
            Self::LineRange { start_line, .. } | Self::CodeBlock { start_line, .. } => *start_line,
        }
    }

    pub fn end_line(&self) -> u32 {
        match self {
            Self::SingleLine { line } => *line,
            Self::LineRange { end_line, .. } | Self::CodeBlock { end_line, .. } => *end_line,
        }
    }
}

/// A review comment in the local store. Persisted across restarts.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewComment {
    pub id: i64,
    pub pr_number: u64,
    pub file_path: String,
    /// SHA the anchor lines are valid against. Used so a remote refresh can
    /// detect stale anchors when the PR moves on.
    pub head_sha: String,
    pub body: String,
    pub author: Option<String>,
    pub state: CommentState,
    pub anchor: CommentAnchor,
    pub created_at: i64,
    pub updated_at: i64,
    /// GitHub review-comment id once published. Used as the idempotency key
    /// when retrying a partial submit.
    pub github_id: Option<i64>,
    /// Last submit failure message; cleared on success.
    pub submit_error: Option<String>,
}

/// Patch payload accepted by `update_local_comment`. Any field left `None`
/// is preserved as-is.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommentUpdate {
    pub body: Option<String>,
    pub state: Option<CommentState>,
    pub anchor: Option<CommentAnchor>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn anchor_serializes_with_kind_discriminator() {
        let json = serde_json::to_string(&CommentAnchor::LineRange {
            start_line: 4,
            end_line: 9,
        })
        .unwrap();
        assert!(json.contains("\"kind\":\"lineRange\""));
        assert!(json.contains("\"startLine\":4"));
        assert!(json.contains("\"endLine\":9"));
    }

    #[test]
    fn state_round_trips_via_str() {
        for s in [
            CommentState::Draft,
            CommentState::Submitted,
            CommentState::Hidden,
            CommentState::Resolved,
            CommentState::Deleted,
        ] {
            assert_eq!(CommentState::from_str(s.as_str()), Some(s));
        }
    }

    #[test]
    fn deleted_is_terminal() {
        assert!(!CommentState::Deleted.can_transition_to(CommentState::Draft));
        assert!(!CommentState::Deleted.can_transition_to(CommentState::Submitted));
    }

    #[test]
    fn draft_can_become_submitted() {
        assert!(CommentState::Draft.can_transition_to(CommentState::Submitted));
        assert!(CommentState::Draft.can_transition_to(CommentState::Hidden));
        assert!(!CommentState::Draft.can_transition_to(CommentState::Resolved));
    }

    #[test]
    fn anchor_line_helpers() {
        let a = CommentAnchor::SingleLine { line: 12 };
        assert_eq!(a.start_line(), 12);
        assert_eq!(a.end_line(), 12);
        let b = CommentAnchor::CodeBlock {
            start_line: 4,
            end_line: 7,
            code_start_line: 3,
        };
        assert_eq!(b.start_line(), 4);
        assert_eq!(b.end_line(), 7);
    }
}

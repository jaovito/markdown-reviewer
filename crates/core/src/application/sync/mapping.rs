//! Pure anchor-mapping algorithm — decides whether a remote thread can be
//! anchored to the current head, and why if not.

use crate::domain::{CommentAnchor, MappingStatus, RemoteThread};
use crate::ports::FileResolver;
use crate::AppError;

/// Maps a remote thread onto an anchor against `head_sha`. Returns the
/// anchor + status pair so callers can re-set both on the thread.
pub async fn map_anchor(
    thread: &RemoteThread,
    head_sha: &str,
    repo_path: &str,
    files: &dyn FileResolver,
) -> (Option<CommentAnchor>, MappingStatus) {
    // 1. GitHub-flagged outdated short-circuit.
    if thread.is_outdated || thread.line.is_none() {
        return (
            None,
            MappingStatus::Outdated {
                reason: "github_outdated".into(),
            },
        );
    }
    let end_line = thread
        .line
        .expect("checked is_some() in the guard above");
    let start_line = thread.start_line.unwrap_or(end_line);

    // 2. Same-commit fast path.
    if thread.original_commit_id == head_sha {
        return (Some(build_anchor(start_line, end_line)), MappingStatus::Mapped);
    }

    // 3. Cross-commit — find the original snippet in the new head.
    let original = match files
        .read(repo_path, &thread.original_commit_id, &thread.path)
        .await
    {
        Ok(text) => text,
        // The original blob is unreachable — treat as unmapped, not as a
        // hard error. The thread is still surfaced under "Unmapped".
        Err(AppError::FileNotFound { .. } | _) => {
            return (None, MappingStatus::FileMissing);
        }
    };
    let Ok(new) = files.read(repo_path, head_sha, &thread.path).await else {
        return (None, MappingStatus::FileMissing);
    };

    let Some(snippet) = extract_lines(&original, start_line, end_line) else {
        return (None, MappingStatus::LineMoved);
    };

    let matches = find_snippet_positions(&new, &snippet);
    match matches.len() {
        1 => {
            let new_start = matches[0];
            let span = end_line - start_line;
            (
                Some(build_anchor(new_start, new_start + span)),
                MappingStatus::Mapped,
            )
        }
        0 => (None, MappingStatus::LineMoved),
        _ => (None, MappingStatus::Ambiguous),
    }
}

fn build_anchor(start: u32, end: u32) -> CommentAnchor {
    if start == end {
        CommentAnchor::SingleLine { line: start }
    } else {
        CommentAnchor::LineRange {
            start_line: start,
            end_line: end,
        }
    }
}

/// Returns the contiguous lines `[start..=end]` (1-indexed) of `text` joined
/// by `\n`, or `None` when the range falls outside the file.
fn extract_lines(text: &str, start: u32, end: u32) -> Option<String> {
    let lines: Vec<&str> = text.lines().collect();
    let s = (start as usize).checked_sub(1)?;
    let e = (end as usize).checked_sub(1)?;
    if e >= lines.len() {
        return None;
    }
    Some(lines[s..=e].join("\n"))
}

/// Returns every 1-indexed starting line in `haystack` where `snippet` is
/// found as a contiguous block of full lines.
fn find_snippet_positions(haystack: &str, snippet: &str) -> Vec<u32> {
    let hay: Vec<&str> = haystack.lines().collect();
    let needle: Vec<&str> = snippet.split('\n').collect();
    if needle.is_empty() || hay.len() < needle.len() {
        return Vec::new();
    }
    let mut out = Vec::new();
    let last_start = hay.len() - needle.len();
    for start in 0..=last_start {
        if hay[start..start + needle.len()] == needle[..] {
            out.push(u32::try_from(start).unwrap_or(u32::MAX) + 1);
        }
    }
    out
}

//! Use-case tests for `application::sync::mapping::map_anchor`.

use std::collections::HashMap;
use std::sync::Mutex;

use async_trait::async_trait;
use markdown_reviewer_core::application::sync::mapping::map_anchor;
use markdown_reviewer_core::domain::{
    CommentAnchor, MappingStatus, RemoteComment, RemoteThread, ThreadState,
};
use markdown_reviewer_core::ports::FileResolver;
use markdown_reviewer_core::{AppError, AppResult};

/// Resolves files by exact (sha, path) lookup.
#[derive(Default)]
struct FakeFiles {
    files: Mutex<HashMap<(String, String), String>>,
}

impl FakeFiles {
    fn insert(&self, sha: &str, path: &str, content: &str) {
        self.files
            .lock()
            .unwrap()
            .insert((sha.into(), path.into()), content.into());
    }
}

#[async_trait]
impl FileResolver for FakeFiles {
    async fn read(&self, _repo_path: &str, sha: &str, path: &str) -> AppResult<String> {
        self.files
            .lock()
            .unwrap()
            .get(&(sha.into(), path.into()))
            .cloned()
            .ok_or_else(|| AppError::FileNotFound {
                sha: sha.into(),
                path: path.into(),
            })
    }
}

fn thread_with(
    original_sha: &str,
    path: &str,
    original_line: u32,
    original_start_line: Option<u32>,
    line: Option<u32>,
    is_outdated: bool,
) -> RemoteThread {
    RemoteThread {
        thread_id: "T_kw1".into(),
        path: path.into(),
        original_commit_id: original_sha.into(),
        line,
        start_line: None,
        original_line,
        original_start_line,
        state: ThreadState::Open,
        is_outdated,
        viewer_can_resolve: true,
        viewer_can_unresolve: false,
        comments: vec![RemoteComment {
            comment_id: 1,
            author: "alice".into(),
            author_avatar_url: None,
            body: "hi".into(),
            created_at: "2026-01-01T00:00:00Z".into(),
            updated_at: "2026-01-01T00:00:00Z".into(),
            viewer_can_update: false,
            viewer_can_delete: false,
            html_url: "https://example".into(),
        }],
        anchor: None,
        mapping_status: MappingStatus::Mapped,
    }
}

#[tokio::test]
async fn maps_when_head_matches_original_commit() {
    let files = FakeFiles::default();
    let t = thread_with("abc", "README.md", 4, None, Some(4), false);
    let (anchor, status) = map_anchor(&t, "abc", "/tmp", &files).await;
    assert_eq!(status, MappingStatus::Mapped);
    assert_eq!(anchor, Some(CommentAnchor::SingleLine { line: 4 }));
}

#[tokio::test]
async fn maps_multi_line_range_when_head_matches() {
    let files = FakeFiles::default();
    let mut t = thread_with("abc", "doc.md", 7, Some(4), Some(7), false);
    t.start_line = Some(4);
    let (anchor, status) = map_anchor(&t, "abc", "/tmp", &files).await;
    assert_eq!(status, MappingStatus::Mapped);
    assert_eq!(
        anchor,
        Some(CommentAnchor::LineRange { start_line: 4, end_line: 7 })
    );
}

#[tokio::test]
async fn outdated_threads_stay_unmapped() {
    let files = FakeFiles::default();
    let t = thread_with("abc", "README.md", 4, None, None, true);
    let (anchor, status) = map_anchor(&t, "abc", "/tmp", &files).await;
    assert!(anchor.is_none());
    assert!(matches!(status, MappingStatus::Outdated { .. }));
}

#[tokio::test]
async fn snippet_relocated_in_new_head_remaps() {
    let files = FakeFiles::default();
    files.insert("old", "doc.md", "alpha\nbeta\ngamma\n"); // line 2 = "beta"
    files.insert("new", "doc.md", "x\ny\nz\nbeta\n"); // line 4 = "beta"
    let t = thread_with("old", "doc.md", 2, None, Some(2), false);
    let (anchor, status) = map_anchor(&t, "new", "/tmp", &files).await;
    assert_eq!(status, MappingStatus::Mapped);
    assert_eq!(anchor, Some(CommentAnchor::SingleLine { line: 4 }));
}

#[tokio::test]
async fn snippet_missing_in_new_head_is_line_moved() {
    let files = FakeFiles::default();
    files.insert("old", "doc.md", "alpha\nbeta\n");
    files.insert("new", "doc.md", "alpha\nDELTA\n");
    let t = thread_with("old", "doc.md", 2, None, Some(2), false);
    let (anchor, status) = map_anchor(&t, "new", "/tmp", &files).await;
    assert!(anchor.is_none());
    assert_eq!(status, MappingStatus::LineMoved);
}

#[tokio::test]
async fn snippet_appears_twice_is_ambiguous() {
    let files = FakeFiles::default();
    files.insert("old", "doc.md", "alpha\nbeta\n");
    files.insert("new", "doc.md", "beta\nbeta\n");
    let t = thread_with("old", "doc.md", 2, None, Some(2), false);
    let (anchor, status) = map_anchor(&t, "new", "/tmp", &files).await;
    assert!(anchor.is_none());
    assert_eq!(status, MappingStatus::Ambiguous);
}

#[tokio::test]
async fn missing_file_at_new_head_is_file_missing() {
    let files = FakeFiles::default();
    files.insert("old", "doc.md", "alpha\nbeta\n");
    // new sha has no "doc.md" entry → resolver returns FileNotFound.
    let t = thread_with("old", "doc.md", 2, None, Some(2), false);
    let (anchor, status) = map_anchor(&t, "new", "/tmp", &files).await;
    assert!(anchor.is_none());
    assert_eq!(status, MappingStatus::FileMissing);
}

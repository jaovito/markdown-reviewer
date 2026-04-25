//! Integration tests for `SqliteCommentsStore` against a real `SQLite` file.

use markdown_reviewer_core::domain::{CommentAnchor, CommentState, CommentUpdate};
use markdown_reviewer_core::ports::{CommentsStore, NewComment, SubmitOutcome};
use markdown_reviewer_infra::sqlite::{open_and_migrate, SqliteCommentsStore};
use tempfile::TempDir;

fn new(path: &str, body: &str, anchor: CommentAnchor) -> NewComment {
    NewComment {
        pr_number: 42,
        file_path: path.to_string(),
        head_sha: "deadbeef".to_string(),
        body: body.to_string(),
        author: Some("octocat".to_string()),
        anchor,
    }
}

#[tokio::test]
#[ignore = "touches a real sqlite file; run with --ignored"]
async fn create_then_list_for_pr() {
    let dir = TempDir::new().unwrap();
    let db = open_and_migrate(&dir.path().join("c.sqlite")).unwrap();
    let store = SqliteCommentsStore::new(db.clone());

    store
        .create(
            new("README.md", "lgtm", CommentAnchor::SingleLine { line: 4 }),
            1_000,
        )
        .await
        .unwrap();
    store
        .create(
            new(
                "docs/a.md",
                "context?",
                CommentAnchor::LineRange {
                    start_line: 12,
                    end_line: 14,
                },
            ),
            2_000,
        )
        .await
        .unwrap();

    let list = store.list_for_pr(42).await.unwrap();
    assert_eq!(list.len(), 2);
    assert_eq!(list[0].file_path, "README.md");
    assert_eq!(list[1].file_path, "docs/a.md");
    assert!(matches!(list[1].anchor, CommentAnchor::LineRange { .. }));
}

#[tokio::test]
#[ignore = "touches a real sqlite file; run with --ignored"]
async fn update_changes_body_and_state() {
    let dir = TempDir::new().unwrap();
    let db = open_and_migrate(&dir.path().join("c.sqlite")).unwrap();
    let store = SqliteCommentsStore::new(db);

    let c = store
        .create(
            new("R.md", "first", CommentAnchor::SingleLine { line: 1 }),
            1_000,
        )
        .await
        .unwrap();

    let updated = store
        .update(
            c.id,
            CommentUpdate {
                body: Some("second".into()),
                state: Some(CommentState::Hidden),
                anchor: None,
            },
            2_000,
        )
        .await
        .unwrap();

    assert_eq!(updated.body, "second");
    assert_eq!(updated.state, CommentState::Hidden);
    assert_eq!(updated.updated_at, 2_000);
}

#[tokio::test]
#[ignore = "touches a real sqlite file; run with --ignored"]
async fn delete_soft_deletes() {
    let dir = TempDir::new().unwrap();
    let db = open_and_migrate(&dir.path().join("c.sqlite")).unwrap();
    let store = SqliteCommentsStore::new(db);

    let c = store
        .create(
            new("R.md", "x", CommentAnchor::SingleLine { line: 1 }),
            1_000,
        )
        .await
        .unwrap();
    store.delete(c.id, 2_000).await.unwrap();

    let row = store.get(c.id).await.unwrap().unwrap();
    assert_eq!(row.state, CommentState::Deleted);
}

#[tokio::test]
#[ignore = "touches a real sqlite file; run with --ignored"]
async fn record_submit_marks_submitted() {
    let dir = TempDir::new().unwrap();
    let db = open_and_migrate(&dir.path().join("c.sqlite")).unwrap();
    let store = SqliteCommentsStore::new(db);

    let c = store
        .create(
            new("R.md", "x", CommentAnchor::SingleLine { line: 1 }),
            1_000,
        )
        .await
        .unwrap();
    let updated = store
        .record_submit(
            c.id,
            SubmitOutcome {
                github_id: Some(98765),
                submit_error: None,
            },
            2_000,
        )
        .await
        .unwrap();
    assert_eq!(updated.state, CommentState::Submitted);
    assert_eq!(updated.github_id, Some(98765));
    assert!(updated.submit_error.is_none());
}

#[tokio::test]
#[ignore = "touches a real sqlite file; run with --ignored"]
async fn record_submit_failure_keeps_draft_with_error() {
    let dir = TempDir::new().unwrap();
    let db = open_and_migrate(&dir.path().join("c.sqlite")).unwrap();
    let store = SqliteCommentsStore::new(db);

    let c = store
        .create(
            new("R.md", "x", CommentAnchor::SingleLine { line: 1 }),
            1_000,
        )
        .await
        .unwrap();
    let updated = store
        .record_submit(
            c.id,
            SubmitOutcome {
                github_id: None,
                submit_error: Some("rate limited".into()),
            },
            2_000,
        )
        .await
        .unwrap();
    assert_eq!(updated.state, CommentState::Draft);
    assert_eq!(updated.submit_error.as_deref(), Some("rate limited"));
}

#[tokio::test]
#[ignore = "touches a real sqlite file; run with --ignored"]
async fn survives_reopen() {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("c.sqlite");

    let id = {
        let db = open_and_migrate(&path).unwrap();
        let store = SqliteCommentsStore::new(db);
        store
            .create(
                new("R.md", "persist", CommentAnchor::SingleLine { line: 7 }),
                1_000,
            )
            .await
            .unwrap()
            .id
    };

    let db = open_and_migrate(&path).unwrap();
    let store = SqliteCommentsStore::new(db);
    let row = store.get(id).await.unwrap().unwrap();
    assert_eq!(row.body, "persist");
    assert_eq!(row.anchor, CommentAnchor::SingleLine { line: 7 });
}

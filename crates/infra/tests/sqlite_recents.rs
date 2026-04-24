//! Integration tests for `SqliteRecentsStore` against a real `SQLite` file.

use markdown_reviewer_core::ports::{RecentRepository, RecentsStore};
use markdown_reviewer_infra::sqlite::{open_and_migrate, SqliteRecentsStore};
use tempfile::TempDir;

fn sample(path: &str, ts: i64) -> RecentRepository {
    RecentRepository {
        path: path.to_string(),
        label: "test/repo".to_string(),
        remote_url: Some("git@github.com:test/repo.git".to_string()),
        owner: Some("test".to_string()),
        repo: Some("repo".to_string()),
        last_opened_at: ts,
    }
}

#[tokio::test]
#[ignore = "touches a real sqlite file; run with --ignored"]
async fn round_trip_recents() {
    let dir = TempDir::new().unwrap();
    let db = open_and_migrate(&dir.path().join("store.sqlite")).unwrap();
    let store = SqliteRecentsStore::new(db.clone());

    store.upsert(sample("/a", 1_000)).await.unwrap();
    store.upsert(sample("/b", 2_000)).await.unwrap();

    let list = store.list().await.unwrap();
    // Ordered by last_opened_at DESC.
    assert_eq!(list.len(), 2);
    assert_eq!(list[0].path, "/b");
    assert_eq!(list[1].path, "/a");
}

#[tokio::test]
#[ignore = "touches a real sqlite file; run with --ignored"]
async fn upsert_overwrites_and_remove_clears() {
    let dir = TempDir::new().unwrap();
    let db = open_and_migrate(&dir.path().join("store.sqlite")).unwrap();
    let store = SqliteRecentsStore::new(db);

    store.upsert(sample("/x", 1_000)).await.unwrap();
    store.upsert(sample("/x", 9_999)).await.unwrap();
    let list = store.list().await.unwrap();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].last_opened_at, 9_999);

    store.remove("/x").await.unwrap();
    assert!(store.list().await.unwrap().is_empty());
}

#[tokio::test]
#[ignore = "touches a real sqlite file; run with --ignored"]
async fn survives_reopen() {
    let dir = TempDir::new().unwrap();
    let db_path = dir.path().join("store.sqlite");

    {
        let db = open_and_migrate(&db_path).unwrap();
        let store = SqliteRecentsStore::new(db);
        store.upsert(sample("/p", 42)).await.unwrap();
    }

    // Reopen from disk — simulates app restart.
    let db = open_and_migrate(&db_path).unwrap();
    let store = SqliteRecentsStore::new(db);
    let list = store.list().await.unwrap();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].path, "/p");
}

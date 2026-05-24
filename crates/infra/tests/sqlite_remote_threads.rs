use markdown_reviewer_core::domain::{MappingStatus, RemoteThread, ThreadState};
use markdown_reviewer_core::ports::{CachedRefresh, RemoteThreadsStore};
use markdown_reviewer_infra::sqlite::{open_and_migrate, SqliteRemoteThreadsStore};
use tempfile::tempdir;

fn sample_thread() -> RemoteThread {
    RemoteThread {
        thread_id: "T1".into(),
        path: "doc.md".into(),
        original_commit_id: "abc".into(),
        line: Some(4),
        start_line: None,
        original_line: 4,
        original_start_line: None,
        state: ThreadState::Open,
        is_outdated: false,
        viewer_can_resolve: true,
        viewer_can_unresolve: false,
        comments: vec![],
        anchor: None,
        mapping_status: MappingStatus::Mapped,
    }
}

#[tokio::test]
async fn roundtrips_a_cache_row() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("test.sqlite");
    let db = open_and_migrate(&db_path).unwrap();
    let store = SqliteRemoteThreadsStore::new(db);

    let cached = CachedRefresh {
        head_sha: "abc".into(),
        refreshed_at_ms: 42,
        threads: vec![sample_thread()],
        unmapped: vec![],
    };
    store.put("/repo", 7, "abc", &cached).await.unwrap();

    let fetched = store.get("/repo", 7).await.unwrap().unwrap();
    assert_eq!(fetched.head_sha, "abc");
    assert_eq!(fetched.refreshed_at_ms, 42);
    assert_eq!(fetched.threads.len(), 1);
}

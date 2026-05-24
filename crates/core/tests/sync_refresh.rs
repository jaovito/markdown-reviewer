//! End-to-end tests for `application::sync::refresh::run`.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use async_trait::async_trait;
use markdown_reviewer_core::application::sync::{refresh, Sync};
use markdown_reviewer_core::domain::{
    ChangedFile, MappingStatus, PullRequestDetail, PullRequestSummary, RemoteComment,
    RemoteThread, ThreadState,
};
use markdown_reviewer_core::ports::{
    CachedRefresh, Clock, FetchedReviewThreads, FileResolver, GhAuthReport, GhClient,
    RemoteThreadsStore, ReviewCommentInput,
};
use markdown_reviewer_core::{AppError, AppResult};

#[derive(Default)]
struct FakeFiles(Mutex<HashMap<(String, String), String>>);

#[async_trait]
impl FileResolver for FakeFiles {
    async fn read(&self, _: &str, sha: &str, path: &str) -> AppResult<String> {
        self.0
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

struct FakeGh {
    payload: Mutex<FetchedReviewThreads>,
}

#[async_trait]
impl GhClient for FakeGh {
    async fn version(&self) -> AppResult<String> { unimplemented!() }
    async fn auth_status(&self) -> AppResult<GhAuthReport> { unimplemented!() }
    async fn list_pull_requests(&self, _: &str) -> AppResult<Vec<PullRequestSummary>> { unimplemented!() }
    async fn load_pull_request(&self, _: &str, _: u64) -> AppResult<PullRequestDetail> { unimplemented!() }
    async fn list_changed_files(&self, _: &str, _: u64) -> AppResult<Vec<ChangedFile>> { unimplemented!() }
    async fn get_file_content(&self, _: &str, _: &str, _: &str) -> AppResult<String> { unimplemented!() }
    async fn submit_review_batch(&self, _: &str, _: u64, _: &str, _: &[ReviewCommentInput]) -> AppResult<Vec<i64>> { unimplemented!() }
    async fn submit_review_comment(&self, _: &str, _: u64, _: &str, _: &ReviewCommentInput) -> AppResult<i64> { unimplemented!() }

    async fn list_review_threads(&self, _: &str, _: u64) -> AppResult<FetchedReviewThreads> {
        Ok(self.payload.lock().unwrap().clone())
    }

    async fn reply_review_comment(&self, _: &str, _: u64, _: i64, _: &str) -> AppResult<RemoteComment> { unimplemented!() }
    async fn edit_review_comment(&self, _: &str, _: i64, _: &str) -> AppResult<RemoteComment> { unimplemented!() }
    async fn delete_review_comment(&self, _: &str, _: i64) -> AppResult<()> { unimplemented!() }
    async fn resolve_review_thread(&self, _: &str, _: &str) -> AppResult<RemoteThread> { unimplemented!() }
    async fn unresolve_review_thread(&self, _: &str, _: &str) -> AppResult<RemoteThread> { unimplemented!() }
}

#[derive(Default)]
struct FakeStore(Mutex<HashMap<(String, u64), CachedRefresh>>);

#[async_trait]
impl RemoteThreadsStore for FakeStore {
    async fn get(&self, repo: &str, pr: u64) -> AppResult<Option<CachedRefresh>> {
        Ok(self.0.lock().unwrap().get(&(repo.into(), pr)).cloned())
    }
    async fn put(&self, repo: &str, pr: u64, _head: &str, cached: &CachedRefresh) -> AppResult<()> {
        self.0
            .lock()
            .unwrap()
            .insert((repo.into(), pr), cached.clone());
        Ok(())
    }
}

#[derive(Default)]
struct FixedClock;
impl Clock for FixedClock {
    fn now(&self) -> time::OffsetDateTime {
        time::OffsetDateTime::from_unix_timestamp(1_700_000_000).unwrap()
    }
    fn now_unix_ms(&self) -> i64 { 1_700_000_000_000 }
}

fn thread(thread_id: &str, path: &str, line: u32, original_sha: &str) -> RemoteThread {
    RemoteThread {
        thread_id: thread_id.into(),
        path: path.into(),
        original_commit_id: original_sha.into(),
        line: Some(line),
        start_line: None,
        original_line: line,
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
async fn partitions_mapped_and_unmapped_and_writes_cache() {
    let gh = Arc::new(FakeGh {
        payload: Mutex::new(FetchedReviewThreads {
            threads: vec![
                thread("T1", "doc.md", 1, "abc"), // will map (same head)
                {
                    let mut t = thread("T2", "missing.md", 1, "abc");
                    t.is_outdated = true;
                    t.line = None;
                    t
                },
            ],
            truncated: false,
        }),
    });
    let files = Arc::new(FakeFiles::default());
    let store = Arc::new(FakeStore::default());
    let svc = Sync {
        gh: gh.clone(),
        store: store.clone(),
        files,
        clock: Arc::new(FixedClock),
    };

    let result = refresh::run(&svc, "/repo", 7, "abc").await.unwrap();
    assert_eq!(result.threads.len(), 1);
    assert_eq!(result.unmapped.len(), 1);
    assert_eq!(result.refreshed_at_ms, 1_700_000_000_000);

    let cached = store.get("/repo", 7).await.unwrap().expect("cache row");
    assert_eq!(cached.head_sha, "abc");
    assert_eq!(cached.threads.len(), 1);
    assert_eq!(cached.unmapped.len(), 1);
}

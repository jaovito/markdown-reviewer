//! Use-case tests for `sync::mutations`. Confirms each call delegates to the
//! `GhClient` with the right arguments and propagates viewer-denied errors as
//! `Validation` so the UI can map them to a read-only tooltip.

use std::sync::{Arc, Mutex};

use async_trait::async_trait;
use markdown_reviewer_core::application::sync::{mutations, Sync};
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
struct FakeFiles;
#[async_trait]
impl FileResolver for FakeFiles {
    async fn read(&self, _: &str, _: &str, _: &str) -> AppResult<String> {
        unimplemented!()
    }
}

#[derive(Default)]
struct FakeStore;
#[async_trait]
impl RemoteThreadsStore for FakeStore {
    async fn get(&self, _: &str, _: u64) -> AppResult<Option<CachedRefresh>> { Ok(None) }
    async fn put(&self, _: &str, _: u64, _: &str, _: &CachedRefresh) -> AppResult<()> { Ok(()) }
}

struct FixedClock;
impl Clock for FixedClock {
    fn now(&self) -> time::OffsetDateTime {
        time::OffsetDateTime::from_unix_timestamp(0).unwrap()
    }
    fn now_unix_ms(&self) -> i64 { 0 }
}

#[derive(Default)]
struct GhSpy {
    pub reply_calls: Mutex<Vec<(i64, String)>>,
    pub edit_calls: Mutex<Vec<(i64, String)>>,
    pub delete_calls: Mutex<Vec<i64>>,
    pub resolve_calls: Mutex<Vec<String>>,
    pub unresolve_calls: Mutex<Vec<String>>,
    pub fail_with: Mutex<Option<AppError>>,
}

fn sample_comment(id: i64) -> RemoteComment {
    RemoteComment {
        comment_id: id,
        author: "alice".into(),
        author_avatar_url: None,
        body: "body".into(),
        created_at: "2026-01-01T00:00:00Z".into(),
        updated_at: "2026-01-01T00:00:00Z".into(),
        viewer_can_update: true,
        viewer_can_delete: true,
        html_url: "https://".into(),
    }
}

fn sample_thread(id: &str) -> RemoteThread {
    RemoteThread {
        thread_id: id.into(),
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
        comments: vec![sample_comment(1)],
        anchor: None,
        mapping_status: MappingStatus::Mapped,
    }
}

#[async_trait]
impl GhClient for GhSpy {
    async fn version(&self) -> AppResult<String> { unimplemented!() }
    async fn auth_status(&self) -> AppResult<GhAuthReport> { unimplemented!() }
    async fn list_pull_requests(&self, _: &str) -> AppResult<Vec<PullRequestSummary>> { unimplemented!() }
    async fn load_pull_request(&self, _: &str, _: u64) -> AppResult<PullRequestDetail> { unimplemented!() }
    async fn list_changed_files(&self, _: &str, _: u64) -> AppResult<Vec<ChangedFile>> { unimplemented!() }
    async fn get_file_content(&self, _: &str, _: &str, _: &str) -> AppResult<String> { unimplemented!() }
    async fn submit_review_batch(&self, _: &str, _: u64, _: &str, _: &[ReviewCommentInput]) -> AppResult<Vec<i64>> { unimplemented!() }
    async fn submit_review_comment(&self, _: &str, _: u64, _: &str, _: &ReviewCommentInput) -> AppResult<i64> { unimplemented!() }
    async fn list_review_threads(&self, _: &str, _: u64) -> AppResult<FetchedReviewThreads> { unimplemented!() }

    async fn reply_review_comment(&self, _: &str, _: u64, in_reply: i64, body: &str) -> AppResult<RemoteComment> {
        if let Some(err) = self.fail_with.lock().unwrap().clone() { return Err(err); }
        self.reply_calls.lock().unwrap().push((in_reply, body.into()));
        Ok(sample_comment(99))
    }
    async fn edit_review_comment(&self, _: &str, id: i64, body: &str) -> AppResult<RemoteComment> {
        if let Some(err) = self.fail_with.lock().unwrap().clone() { return Err(err); }
        self.edit_calls.lock().unwrap().push((id, body.into()));
        Ok(sample_comment(id))
    }
    async fn delete_review_comment(&self, _: &str, id: i64) -> AppResult<()> {
        if let Some(err) = self.fail_with.lock().unwrap().clone() { return Err(err); }
        self.delete_calls.lock().unwrap().push(id);
        Ok(())
    }
    async fn resolve_review_thread(&self, _: &str, id: &str) -> AppResult<RemoteThread> {
        if let Some(err) = self.fail_with.lock().unwrap().clone() { return Err(err); }
        self.resolve_calls.lock().unwrap().push(id.into());
        Ok(sample_thread(id))
    }
    async fn unresolve_review_thread(&self, _: &str, id: &str) -> AppResult<RemoteThread> {
        if let Some(err) = self.fail_with.lock().unwrap().clone() { return Err(err); }
        self.unresolve_calls.lock().unwrap().push(id.into());
        Ok(sample_thread(id))
    }
}

fn svc_with(gh: Arc<GhSpy>) -> Sync {
    Sync {
        gh,
        store: Arc::new(FakeStore),
        files: Arc::new(FakeFiles),
        clock: Arc::new(FixedClock),
    }
}

#[tokio::test]
async fn reply_delegates_to_gh() {
    let gh = Arc::new(GhSpy::default());
    let svc = svc_with(gh.clone());
    let out = mutations::reply(&svc, "/repo", 7, 42, "ok").await.unwrap();
    assert_eq!(out.comment_id, 99);
    assert_eq!(gh.reply_calls.lock().unwrap().as_slice(), &[(42, "ok".to_string())]);
}

#[tokio::test]
async fn edit_passes_body() {
    let gh = Arc::new(GhSpy::default());
    let svc = svc_with(gh.clone());
    mutations::edit(&svc, "/repo", 11, "new body").await.unwrap();
    assert_eq!(
        gh.edit_calls.lock().unwrap().as_slice(),
        &[(11, "new body".to_string())]
    );
}

#[tokio::test]
async fn delete_passes_id() {
    let gh = Arc::new(GhSpy::default());
    let svc = svc_with(gh.clone());
    mutations::delete(&svc, "/repo", 11).await.unwrap();
    assert_eq!(gh.delete_calls.lock().unwrap().as_slice(), &[11]);
}

#[tokio::test]
async fn resolve_and_reopen_delegate() {
    let gh = Arc::new(GhSpy::default());
    let svc = svc_with(gh.clone());
    mutations::resolve(&svc, "/repo", "PRRT_1").await.unwrap();
    mutations::reopen(&svc, "/repo", "PRRT_1").await.unwrap();
    assert_eq!(gh.resolve_calls.lock().unwrap().as_slice(), &["PRRT_1".to_string()]);
    assert_eq!(gh.unresolve_calls.lock().unwrap().as_slice(), &["PRRT_1".to_string()]);
}

#[tokio::test]
async fn viewer_denied_surfaces_as_validation() {
    let gh = Arc::new(GhSpy::default());
    *gh.fail_with.lock().unwrap() = Some(AppError::Validation {
        message: "read-only on GitHub".into(),
    });
    let svc = svc_with(gh.clone());
    let err = mutations::edit(&svc, "/repo", 11, "x").await.unwrap_err();
    assert!(matches!(err, AppError::Validation { .. }));
}

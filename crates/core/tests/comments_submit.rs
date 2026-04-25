//! Use-case tests for `application::comments::submit::run`.
//!
//! Covers the three branches the issue calls out: batch success, batch
//! failure with successful per-comment fallback, and a mixed fallback where
//! one comment fails. Idempotency (already-submitted comments are skipped)
//! and `head_sha` heterogeneity (forces per-comment) round things out.

use std::sync::{
    atomic::{AtomicI64, Ordering},
    Arc,
};

use async_trait::async_trait;
use markdown_reviewer_core::application::comments::{submit, Comments};
use markdown_reviewer_core::domain::{
    ChangedFile, CommentAnchor, CommentState, CommentUpdate, PullRequestDetail, PullRequestSummary,
    ReviewComment,
};
use markdown_reviewer_core::ports::{
    Clock, CommentsStore, GhAuthReport, GhClient, NewComment, ReviewCommentInput, SubmitOutcome,
};
use markdown_reviewer_core::{AppError, AppResult};
use tokio::sync::Mutex;

// ---- in-memory comments store --------------------------------------------

#[derive(Default)]
struct InMemoryCommentsStore {
    next_id: AtomicI64,
    rows: Mutex<Vec<ReviewComment>>,
}

#[async_trait]
impl CommentsStore for InMemoryCommentsStore {
    async fn list_for_pr(&self, pr_number: u64) -> AppResult<Vec<ReviewComment>> {
        Ok(self
            .rows
            .lock()
            .await
            .iter()
            .filter(|c| c.pr_number == pr_number)
            .cloned()
            .collect())
    }

    async fn list_for_file(
        &self,
        pr_number: u64,
        file_path: &str,
    ) -> AppResult<Vec<ReviewComment>> {
        Ok(self
            .rows
            .lock()
            .await
            .iter()
            .filter(|c| c.pr_number == pr_number && c.file_path == file_path)
            .cloned()
            .collect())
    }

    async fn get(&self, id: i64) -> AppResult<Option<ReviewComment>> {
        Ok(self
            .rows
            .lock()
            .await
            .iter()
            .find(|c| c.id == id)
            .cloned())
    }

    async fn create(&self, new: NewComment, now_unix_ms: i64) -> AppResult<ReviewComment> {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst) + 1;
        let row = ReviewComment {
            id,
            pr_number: new.pr_number,
            file_path: new.file_path,
            head_sha: new.head_sha,
            body: new.body,
            author: new.author,
            state: CommentState::Draft,
            anchor: new.anchor,
            created_at: now_unix_ms,
            updated_at: now_unix_ms,
            github_id: None,
            submit_error: None,
        };
        self.rows.lock().await.push(row.clone());
        Ok(row)
    }

    async fn update(
        &self,
        id: i64,
        patch: CommentUpdate,
        now_unix_ms: i64,
    ) -> AppResult<ReviewComment> {
        let mut rows = self.rows.lock().await;
        let row = rows
            .iter_mut()
            .find(|c| c.id == id)
            .ok_or_else(|| AppError::db(format!("comment {id} not found")))?;
        if let Some(b) = patch.body {
            row.body = b;
        }
        if let Some(s) = patch.state {
            row.state = s;
        }
        if let Some(a) = patch.anchor {
            row.anchor = a;
        }
        row.updated_at = now_unix_ms;
        Ok(row.clone())
    }

    async fn delete(&self, id: i64, now_unix_ms: i64) -> AppResult<()> {
        let mut rows = self.rows.lock().await;
        if let Some(row) = rows.iter_mut().find(|c| c.id == id) {
            row.state = CommentState::Deleted;
            row.updated_at = now_unix_ms;
        }
        Ok(())
    }

    async fn record_submit(
        &self,
        id: i64,
        outcome: SubmitOutcome,
        now_unix_ms: i64,
    ) -> AppResult<ReviewComment> {
        let mut rows = self.rows.lock().await;
        let row = rows
            .iter_mut()
            .find(|c| c.id == id)
            .ok_or_else(|| AppError::db(format!("comment {id} not found")))?;
        if let Some(gh_id) = outcome.github_id {
            row.github_id = Some(gh_id);
            row.state = CommentState::Submitted;
            row.submit_error = None;
        } else {
            row.submit_error = outcome.submit_error;
        }
        row.updated_at = now_unix_ms;
        Ok(row.clone())
    }
}

// ---- programmable gh fake ------------------------------------------------

#[derive(Default)]
struct GhScript {
    /// Result of the next `submit_review_batch` call. `Some(Ok(ids))` returns
    /// those ids; `Some(Err(_))` forces a fallback.
    batch: Option<AppResult<Vec<i64>>>,
    /// Per-`local_id` outcomes used by `submit_review_comment`. Anything not
    /// in the map errors with a default "not scripted" message.
    per_comment: std::collections::HashMap<i64, AppResult<i64>>,
    /// Captured invocations for assertion.
    batch_calls: Vec<Vec<ReviewCommentInput>>,
    per_calls: Vec<ReviewCommentInput>,
}

#[derive(Default, Clone)]
struct ScriptedGh {
    inner: Arc<Mutex<GhScript>>,
}

impl ScriptedGh {
    async fn set_batch(&self, result: AppResult<Vec<i64>>) {
        self.inner.lock().await.batch = Some(result);
    }
    async fn set_per_comment(&self, local_id: i64, result: AppResult<i64>) {
        self.inner.lock().await.per_comment.insert(local_id, result);
    }
    async fn batch_call_count(&self) -> usize {
        self.inner.lock().await.batch_calls.len()
    }
    async fn per_call_count(&self) -> usize {
        self.inner.lock().await.per_calls.len()
    }
}

#[async_trait]
impl GhClient for ScriptedGh {
    async fn version(&self) -> AppResult<String> {
        Ok("gh test".into())
    }
    async fn auth_status(&self) -> AppResult<GhAuthReport> {
        Ok(GhAuthReport {
            authenticated: true,
            username: Some("octocat".into()),
            detail: String::new(),
        })
    }
    async fn list_pull_requests(&self, _repo_path: &str) -> AppResult<Vec<PullRequestSummary>> {
        Ok(Vec::new())
    }
    async fn load_pull_request(
        &self,
        _repo_path: &str,
        number: u64,
    ) -> AppResult<PullRequestDetail> {
        Err(AppError::PrNotFound { number })
    }
    async fn list_changed_files(
        &self,
        _repo_path: &str,
        _number: u64,
    ) -> AppResult<Vec<ChangedFile>> {
        Ok(Vec::new())
    }
    async fn get_file_content(
        &self,
        _repo_path: &str,
        _sha: &str,
        _file_path: &str,
    ) -> AppResult<String> {
        Ok(String::new())
    }
    async fn submit_review_batch(
        &self,
        _repo_path: &str,
        _pr_number: u64,
        _head_sha: &str,
        comments: &[ReviewCommentInput],
    ) -> AppResult<Vec<i64>> {
        let mut g = self.inner.lock().await;
        g.batch_calls.push(comments.to_vec());
        match g.batch.take() {
            Some(result) => result,
            None => Err(AppError::process("batch not scripted")),
        }
    }
    async fn submit_review_comment(
        &self,
        _repo_path: &str,
        _pr_number: u64,
        _head_sha: &str,
        comment: &ReviewCommentInput,
    ) -> AppResult<i64> {
        let mut g = self.inner.lock().await;
        g.per_calls.push(comment.clone());
        g.per_comment
            .remove(&comment.local_id)
            .unwrap_or_else(|| Err(AppError::process("comment not scripted")))
    }
}

// ---- clock --------------------------------------------------------------

struct FixedClock(i64);

impl Clock for FixedClock {
    fn now(&self) -> time::OffsetDateTime {
        time::OffsetDateTime::from_unix_timestamp(self.0 / 1_000).unwrap()
    }
    fn now_unix_ms(&self) -> i64 {
        self.0
    }
}

// ---- helpers ------------------------------------------------------------

async fn seed_comment(
    store: &InMemoryCommentsStore,
    pr_number: u64,
    file_path: &str,
    head_sha: &str,
    body: &str,
) -> ReviewComment {
    store
        .create(
            NewComment {
                pr_number,
                file_path: file_path.into(),
                head_sha: head_sha.into(),
                body: body.into(),
                author: None,
                anchor: CommentAnchor::SingleLine { line: 4 },
            },
            1_700_000_000_000,
        )
        .await
        .unwrap()
}

fn build_comments(store: Arc<InMemoryCommentsStore>, gh: Arc<ScriptedGh>) -> Comments {
    Comments {
        store,
        clock: Arc::new(FixedClock(1_700_000_500_000)),
        gh,
    }
}

// ---- tests --------------------------------------------------------------

#[tokio::test]
async fn batch_success_marks_every_comment_submitted() {
    let store = Arc::new(InMemoryCommentsStore::default());
    let gh = Arc::new(ScriptedGh::default());

    let a = seed_comment(&store, 7, "README.md", "sha1", "lgtm").await;
    let b = seed_comment(&store, 7, "docs/x.md", "sha1", "nit").await;

    gh.set_batch(Ok(vec![1001, 1002])).await;

    let svc = build_comments(store.clone(), gh.clone());
    let result = submit::run(&svc, "/repo", 7, &[a.id, b.id]).await.unwrap();

    assert!(result.all_submitted);
    assert_eq!(result.comments.len(), 2);
    assert_eq!(result.comments[0].local_id, a.id);
    assert_eq!(result.comments[0].github_id, Some(1001));
    assert_eq!(result.comments[1].github_id, Some(1002));
    assert!(result.comments.iter().all(|c| c.submitted && c.error.is_none()));

    // Persisted state matches.
    let stored_a = store.get(a.id).await.unwrap().unwrap();
    assert_eq!(stored_a.state, CommentState::Submitted);
    assert_eq!(stored_a.github_id, Some(1001));

    assert_eq!(gh.batch_call_count().await, 1);
    assert_eq!(gh.per_call_count().await, 0);
}

#[tokio::test]
async fn batch_failure_falls_back_to_per_comment() {
    let store = Arc::new(InMemoryCommentsStore::default());
    let gh = Arc::new(ScriptedGh::default());

    let a = seed_comment(&store, 9, "a.md", "sha1", "first").await;
    let b = seed_comment(&store, 9, "b.md", "sha1", "second").await;

    gh.set_batch(Err(AppError::process("422 unprocessable"))).await;
    gh.set_per_comment(a.id, Ok(2001)).await;
    gh.set_per_comment(b.id, Ok(2002)).await;

    let svc = build_comments(store.clone(), gh.clone());
    let result = submit::run(&svc, "/repo", 9, &[a.id, b.id]).await.unwrap();

    assert!(result.all_submitted);
    assert_eq!(result.comments[0].github_id, Some(2001));
    assert_eq!(result.comments[1].github_id, Some(2002));
    assert_eq!(gh.batch_call_count().await, 1);
    assert_eq!(gh.per_call_count().await, 2);

    assert_eq!(
        store.get(b.id).await.unwrap().unwrap().state,
        CommentState::Submitted
    );
}

#[tokio::test]
async fn mixed_fallback_keeps_failures_as_drafts_with_error() {
    let store = Arc::new(InMemoryCommentsStore::default());
    let gh = Arc::new(ScriptedGh::default());

    let ok = seed_comment(&store, 11, "README.md", "sha1", "good").await;
    let bad = seed_comment(&store, 11, "README.md", "sha1", "bad").await;

    gh.set_batch(Err(AppError::process("422"))).await;
    gh.set_per_comment(ok.id, Ok(3001)).await;
    gh.set_per_comment(bad.id, Err(AppError::process("rate limited")))
        .await;

    let svc = build_comments(store.clone(), gh.clone());
    let result = submit::run(&svc, "/repo", 11, &[ok.id, bad.id])
        .await
        .unwrap();

    assert!(!result.all_submitted);
    assert!(result.comments[0].submitted);
    assert_eq!(result.comments[0].github_id, Some(3001));
    assert!(!result.comments[1].submitted);
    assert!(result.comments[1].github_id.is_none());
    assert!(result.comments[1]
        .error
        .as_deref()
        .unwrap()
        .contains("rate limited"));

    // Failed comment is still a draft, with submit_error populated and
    // github_id absent — so a retry is safe.
    let stored_bad = store.get(bad.id).await.unwrap().unwrap();
    assert_eq!(stored_bad.state, CommentState::Draft);
    assert!(stored_bad.github_id.is_none());
    assert!(stored_bad.submit_error.as_deref().unwrap().contains("rate limited"));

    // Successful comment is on disk as Submitted with no lingering error.
    let stored_ok = store.get(ok.id).await.unwrap().unwrap();
    assert_eq!(stored_ok.state, CommentState::Submitted);
    assert!(stored_ok.submit_error.is_none());
}

#[tokio::test]
async fn already_submitted_comments_are_skipped() {
    let store = Arc::new(InMemoryCommentsStore::default());
    let gh = Arc::new(ScriptedGh::default());

    let already = seed_comment(&store, 1, "x.md", "sha1", "old").await;
    // Mark `already` as submitted with a github_id (idempotency).
    store
        .record_submit(
            already.id,
            SubmitOutcome {
                github_id: Some(9999),
                submit_error: None,
            },
            1_700_000_100_000,
        )
        .await
        .unwrap();

    let fresh = seed_comment(&store, 1, "y.md", "sha1", "new").await;
    gh.set_batch(Ok(vec![4242])).await;

    let svc = build_comments(store.clone(), gh.clone());
    let result = submit::run(&svc, "/repo", 1, &[already.id, fresh.id])
        .await
        .unwrap();

    assert!(result.all_submitted);
    assert_eq!(result.comments[0].github_id, Some(9999));
    assert!(result.comments[0].submitted);
    assert_eq!(result.comments[1].github_id, Some(4242));

    // Batch was called only with the fresh comment, not the already-published one.
    let calls = gh.inner.lock().await.batch_calls.clone();
    assert_eq!(calls.len(), 1);
    assert_eq!(calls[0].len(), 1);
    assert_eq!(calls[0][0].local_id, fresh.id);
}

#[tokio::test]
async fn mixed_head_sha_routes_through_per_comment() {
    let store = Arc::new(InMemoryCommentsStore::default());
    let gh = Arc::new(ScriptedGh::default());

    let a = seed_comment(&store, 5, "a.md", "sha1", "one").await;
    let b = seed_comment(&store, 5, "b.md", "sha2", "two").await;

    gh.set_per_comment(a.id, Ok(5001)).await;
    gh.set_per_comment(b.id, Ok(5002)).await;

    let svc = build_comments(store.clone(), gh.clone());
    let result = submit::run(&svc, "/repo", 5, &[a.id, b.id]).await.unwrap();

    assert!(result.all_submitted);
    // No batch attempt when head_sha is heterogeneous.
    assert_eq!(gh.batch_call_count().await, 0);
    assert_eq!(gh.per_call_count().await, 2);
}

# Phase 6 — GitHub Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the full GitHub-sync surface (issues #31, #32, #33, #34) on branch `feat/phase-6-github-sync`: refresh remote threads, map them to local anchors, cache them per-PR, mutate (reply / edit / delete / resolve / reopen) where GitHub allows, and surface unmapped threads in the UI.

**Architecture:** Hexagonal-lite per `ARCHITECTURE.md` — pure `core` (domain types, ports, use cases), `infra` adapters for `gh` GraphQL/REST and SQLite cache, thin `ipc` commands. Frontend gets a new `src/features/sync/` feature with React-Query hooks consumed by the existing `ThreadsPane`. Spec lives at `docs/superpowers/specs/2026-05-24-phase-6-github-sync-design.md` — read it before starting.

**Tech Stack:** Rust (tokio, async-trait, rusqlite, serde, tracing), Tauri v2, React 19 + TypeScript, React Query, Tailwind v4, i18next, Bun for tests/scripts.

---

## File map

**Rust — new files**
- `crates/core/src/domain/remote_thread.rs` — `RemoteThread`, `RemoteComment`, `ThreadState`, `MappingStatus`, `RefreshResult`.
- `crates/core/src/ports/remote_threads_store.rs` — `RemoteThreadsStore` trait + `CachedRefresh` DTO.
- `crates/core/src/ports/file_resolver.rs` — `FileResolver` trait used by the mapping algorithm.
- `crates/core/src/application/sync/mod.rs` — `Sync` use-case bundle (ports).
- `crates/core/src/application/sync/mapping.rs` — pure `map_anchor`.
- `crates/core/src/application/sync/refresh.rs` — orchestrates list → map → cache write.
- `crates/core/src/application/sync/cache.rs` — `get_cached`.
- `crates/core/src/application/sync/mutations.rs` — reply/edit/delete/resolve/reopen use cases.
- `crates/infra/src/gh/review_threads.rs` — GraphQL query + REST mutation helpers.
- `crates/infra/src/gh/file_resolver.rs` — production `FileResolver` (git + gh fallback).
- `crates/infra/src/sqlite/migrations/0004_remote_threads_cache.sql` — cache table.
- `crates/infra/src/sqlite/remote_threads_store.rs` — `SqliteRemoteThreadsStore`.
- `crates/ipc/src/commands/sync.rs` — 7 IPC commands.
- `crates/core/tests/sync_mapping.rs`, `crates/core/tests/sync_refresh.rs`, `crates/core/tests/sync_mutations.rs`.
- `crates/infra/tests/gh_review_threads.rs` — fixture-based parser tests (`#[ignore]`).
- `crates/infra/tests/fixtures/gh/reviewThreads-*.json` — recorded GraphQL response fixtures.

**Rust — modified files**
- `crates/core/src/domain/mod.rs` — re-export new types.
- `crates/core/src/ports/mod.rs` — re-export new ports.
- `crates/core/src/ports/gh.rs` — add 6 new `GhClient` methods.
- `crates/core/src/application/mod.rs` — register `sync`.
- `crates/infra/src/sqlite/mod.rs` — re-export new store.
- `crates/infra/src/sqlite/connection.rs` — append migration to `MIGRATIONS`.
- `crates/infra/src/gh/mod.rs` — re-export helpers.
- `crates/infra/src/gh/gh_cli.rs` — implement the 6 new `GhClient` methods.
- `crates/ipc/src/commands/mod.rs` — register `sync`.
- `crates/ipc/src/state.rs` — add `pub sync: Sync` field.
- `crates/ipc/src/lib.rs` — register the 7 new handlers.
- `src-tauri/src/bootstrap.rs` — wire `SqliteRemoteThreadsStore`, `FileResolver`, and `Sync` bundle into `AppState`.

**Frontend — new files**
- `src/features/sync/hooks/useRemoteThreads.ts` — query + refresh.
- `src/features/sync/hooks/useReplyRemoteThread.ts`, `useEditRemoteComment.ts`, `useDeleteRemoteComment.ts`, `useResolveRemoteThread.ts`, `useReopenRemoteThread.ts`.
- `src/features/sync/components/RemoteThreadCard.tsx` — remote-thread renderer.
- `src/features/sync/components/RemoteReplyComposer.tsx` — single-thread reply textarea.
- `src/features/sync/components/RemoteCommentBody.tsx` — author/avatar/body/actions row.
- `src/features/sync/components/UnmappedThreadsSection.tsx` — collapsible footer in ThreadsPane.
- `src/features/sync/lib/mergeLocalAndRemote.ts` + `.test.ts` — merge + dedupe by `githubId`.
- `src/features/sync/lib/unmappedReason.ts` — i18n key resolver for each `MappingStatus`.

**Frontend — modified files**
- `src/features/sync/index.ts` — replace placeholder with feature surface.
- `src/shared/ipc/contract.ts` — add `RemoteThread`, `RemoteComment`, etc., and the 7 commands.
- `src/shared/ipc/client.ts` — add typed helpers under `ipc.sync.*`.
- `src/shared/ipc/errors.ts` — map `validation` messages from sync errors (e.g. read-only).
- `src/shared/i18n/locales/en.json` — `sync.*` namespace.
- `src/features/main/components/RefreshButton.tsx` — add `remote-threads` to default invalidation keys.
- `src/features/main/components/ThreadsPane.tsx` — consume `useRemoteThreads`, render merged list + unmapped section.
- `src-tauri/capabilities/default.json` — capability lists are auto-derived in Tauri v2 from registered commands; no update needed unless we add a new permission. Verify in Task 10.

---

## Branch / setup

This plan assumes branch `feat/phase-6-github-sync` (already created with the spec commit `docs(phase-6): spec for GitHub sync`). Every task ends in a commit on this branch. The final PR groups everything.

---

# Phase 0 — Foundation

## Task 1: Domain types for remote threads

**Files:**
- Create: `crates/core/src/domain/remote_thread.rs`
- Modify: `crates/core/src/domain/mod.rs`

- [ ] **Step 1: Write the failing test**

Create `crates/core/src/domain/remote_thread.rs` test module:

```rust
//! Domain types for remote-originating PR review threads (Phase 6).
//! GitHub returns line numbers as a mix of `int?` (current position) and
//! `int!` (original position). We mirror that here so the mapping layer
//! can decide what to do without re-fetching.

use serde::{Deserialize, Serialize};

use super::CommentAnchor;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ThreadState {
    Open,
    Resolved,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum MappingStatus {
    Mapped,
    Outdated { reason: String },
    FileMissing,
    LineMoved,
    Ambiguous,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteComment {
    pub comment_id: i64,
    pub author: String,
    pub author_avatar_url: Option<String>,
    pub body: String,
    /// RFC3339 strings; the UI does its own formatting.
    pub created_at: String,
    pub updated_at: String,
    pub viewer_can_update: bool,
    pub viewer_can_delete: bool,
    pub html_url: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteThread {
    /// GraphQL node id of the review thread. Required by resolve/unresolve.
    pub thread_id: String,
    pub path: String,
    pub original_commit_id: String,
    pub line: Option<u32>,
    pub start_line: Option<u32>,
    pub original_line: u32,
    pub original_start_line: Option<u32>,
    pub state: ThreadState,
    pub is_outdated: bool,
    pub viewer_can_resolve: bool,
    pub viewer_can_unresolve: bool,
    pub comments: Vec<RemoteComment>,
    pub anchor: Option<CommentAnchor>,
    pub mapping_status: MappingStatus,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RefreshResult {
    /// Threads with `mapping_status == Mapped` and `anchor.is_some()`.
    pub threads: Vec<RemoteThread>,
    /// Threads we couldn't safely anchor; preserved for the #34 panel.
    pub unmapped: Vec<RemoteThread>,
    pub refreshed_at_ms: i64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mapping_status_serializes_with_kind_tag() {
        let json = serde_json::to_string(&MappingStatus::Outdated {
            reason: "github_outdated".into(),
        })
        .unwrap();
        assert!(json.contains("\"kind\":\"outdated\""));
        assert!(json.contains("\"reason\":\"github_outdated\""));
    }

    #[test]
    fn thread_state_round_trips() {
        let raw = serde_json::to_string(&ThreadState::Resolved).unwrap();
        assert_eq!(raw, "\"resolved\"");
        let back: ThreadState = serde_json::from_str(&raw).unwrap();
        assert_eq!(back, ThreadState::Resolved);
    }
}
```

- [ ] **Step 2: Re-export from domain module**

Edit `crates/core/src/domain/mod.rs` — add the module and re-exports:

```rust
pub mod changed_file;
pub mod comment;
pub mod file_diff;
pub mod pull_request;
pub mod remote_thread;
pub mod repository;
pub mod tool_status;

pub use changed_file::{ChangeStatus, ChangedFile};
pub use comment::{CommentAnchor, CommentState, CommentUpdate, ReviewComment};
pub use file_diff::{DiffHunk, FileDiff, HunkKind};
pub use pull_request::{PullRequestDetail, PullRequestState, PullRequestSummary};
pub use remote_thread::{
    MappingStatus, RefreshResult, RemoteComment, RemoteThread, ThreadState,
};
pub use repository::{RemoteUrl, Repository};
pub use tool_status::{ToolCheck, ToolStatus};
```

- [ ] **Step 3: Run the test and verify it passes**

Run: `cargo test -p markdown-reviewer-core --lib remote_thread`
Expected: 2 tests pass.

- [ ] **Step 4: Commit**

```bash
git add crates/core/src/domain/remote_thread.rs crates/core/src/domain/mod.rs
git commit -m "$(cat <<'EOF'
feat(phase-6): remote thread domain types

Adds RemoteThread/RemoteComment/MappingStatus/RefreshResult.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Port traits — `RemoteThreadsStore` and `FileResolver`

**Files:**
- Create: `crates/core/src/ports/remote_threads_store.rs`
- Create: `crates/core/src/ports/file_resolver.rs`
- Modify: `crates/core/src/ports/mod.rs`

- [ ] **Step 1: Write `RemoteThreadsStore` trait**

Create `crates/core/src/ports/remote_threads_store.rs`:

```rust
use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use crate::domain::{RefreshResult, RemoteThread};
use crate::AppResult;

/// Snapshot returned by `RemoteThreadsStore::get`. Carries the head sha we
/// were anchored to so the UI can warn when the cache predates the current
/// head.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CachedRefresh {
    pub head_sha: String,
    pub refreshed_at_ms: i64,
    pub threads: Vec<RemoteThread>,
    pub unmapped: Vec<RemoteThread>,
}

impl CachedRefresh {
    pub fn into_refresh_result(self) -> RefreshResult {
        RefreshResult {
            threads: self.threads,
            unmapped: self.unmapped,
            refreshed_at_ms: self.refreshed_at_ms,
        }
    }
}

#[async_trait]
pub trait RemoteThreadsStore: Send + Sync {
    /// Reads the cached payload for `(repo_path, pr_number)`. Returns
    /// `Ok(None)` when no row exists yet.
    async fn get(&self, repo_path: &str, pr_number: u64) -> AppResult<Option<CachedRefresh>>;

    /// Writes the cache row, replacing any previous entry for the same
    /// `(repo_path, pr_number)`. Called from `application::sync::refresh`
    /// after a successful round-trip.
    async fn put(
        &self,
        repo_path: &str,
        pr_number: u64,
        head_sha: &str,
        cached: &CachedRefresh,
    ) -> AppResult<()>;
}
```

- [ ] **Step 2: Write `FileResolver` trait**

Create `crates/core/src/ports/file_resolver.rs`:

```rust
use async_trait::async_trait;

use crate::AppResult;

/// Reads a file's contents at a specific commit. Implementations may fall
/// back to `gh` when the ref isn't in the local clone.
#[async_trait]
pub trait FileResolver: Send + Sync {
    async fn read(&self, repo_path: &str, sha: &str, file_path: &str) -> AppResult<String>;
}
```

- [ ] **Step 3: Wire into `ports::mod.rs`**

Edit `crates/core/src/ports/mod.rs`:

```rust
pub mod clock;
pub mod comments_store;
pub mod file_resolver;
pub mod gh;
pub mod git;
pub mod recents_store;
pub mod remote_threads_store;

pub use clock::Clock;
pub use comments_store::{CommentsStore, NewComment, SubmitOutcome};
pub use file_resolver::FileResolver;
pub use gh::{
    GhAuthReport, GhClient, ReviewCommentInput, ReviewSubmissionResult, SubmittedReviewComment,
};
pub use git::GitClient;
pub use recents_store::{RecentRepository, RecentsStore};
pub use remote_threads_store::{CachedRefresh, RemoteThreadsStore};
```

- [ ] **Step 4: Verify it compiles**

Run: `cargo check -p markdown-reviewer-core`
Expected: clean build (no impls yet, so no consumer breakage).

- [ ] **Step 5: Commit**

```bash
git add crates/core/src/ports/remote_threads_store.rs \
         crates/core/src/ports/file_resolver.rs \
         crates/core/src/ports/mod.rs
git commit -m "$(cat <<'EOF'
feat(phase-6): RemoteThreadsStore + FileResolver ports

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Extend `GhClient` port with 7 new methods

**Files:**
- Modify: `crates/core/src/ports/gh.rs`

- [ ] **Step 1: Add method signatures**

Append to `crates/core/src/ports/gh.rs` (inside the existing `#[async_trait] impl GhClient` block — at the end of the trait body):

```rust
    /// Fetches every review thread on a PR via the GraphQL endpoint
    /// `repository.pullRequest.reviewThreads(first: 100)`. Includes the
    /// thread node id (for resolve/unresolve), `isResolved`, `isOutdated`,
    /// and every comment's `viewerCan*` flags. Truncation past 100 threads
    /// is logged inside the adapter and surfaced via `truncated == true`.
    async fn list_review_threads(
        &self,
        repo_path: &str,
        pr_number: u64,
    ) -> AppResult<FetchedReviewThreads>;

    /// Posts a reply to an existing review thread via REST
    /// `POST /repos/{owner}/{repo}/pulls/{n}/comments` with `in_reply_to`.
    /// Returns the freshly-created `RemoteComment`.
    async fn reply_review_comment(
        &self,
        repo_path: &str,
        pr_number: u64,
        in_reply_to_comment_id: i64,
        body: &str,
    ) -> AppResult<crate::domain::RemoteComment>;

    /// `PATCH /repos/{owner}/{repo}/pulls/comments/{id}`.
    async fn edit_review_comment(
        &self,
        repo_path: &str,
        comment_id: i64,
        body: &str,
    ) -> AppResult<crate::domain::RemoteComment>;

    /// `DELETE /repos/{owner}/{repo}/pulls/comments/{id}` — 204 on success.
    async fn delete_review_comment(&self, repo_path: &str, comment_id: i64) -> AppResult<()>;

    /// GraphQL `resolveReviewThread(threadId: <node id>)`. Returns the
    /// updated thread (refetched via `list_review_threads_by_id`).
    async fn resolve_review_thread(
        &self,
        repo_path: &str,
        thread_id: &str,
    ) -> AppResult<crate::domain::RemoteThread>;

    /// GraphQL `unresolveReviewThread(threadId: <node id>)`.
    async fn unresolve_review_thread(
        &self,
        repo_path: &str,
        thread_id: &str,
    ) -> AppResult<crate::domain::RemoteThread>;
```

And add the new return DTO above the trait (after the existing `ReviewSubmissionResult` block):

```rust
/// Raw GraphQL payload as returned by the adapter. The mapping use case is
/// the only consumer; `truncated` lets the UI surface a banner when we
/// stopped at the first page.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchedReviewThreads {
    pub threads: Vec<crate::domain::RemoteThread>,
    pub truncated: bool,
}
```

- [ ] **Step 2: Re-export from `ports::mod.rs`**

Edit `crates/core/src/ports/mod.rs` — update the `gh` re-export line:

```rust
pub use gh::{
    FetchedReviewThreads, GhAuthReport, GhClient, ReviewCommentInput, ReviewSubmissionResult,
    SubmittedReviewComment,
};
```

- [ ] **Step 3: Run the workspace check — every test fake will fail to compile**

Run: `cargo check --workspace --all-targets`
Expected: failures in `crates/core/tests/comments_submit.rs` (and any other test that impls `GhClient`). This is intentional — we're about to add stubs.

- [ ] **Step 4: Add `unimplemented!()` stubs to existing test fakes**

Add to every `impl GhClient for ...` block in `crates/core/tests/` (currently just `comments_submit.rs`) the seven stubs:

```rust
    async fn list_review_threads(
        &self,
        _repo_path: &str,
        _pr_number: u64,
    ) -> AppResult<markdown_reviewer_core::ports::FetchedReviewThreads> {
        unimplemented!("not used in this test")
    }
    async fn reply_review_comment(
        &self,
        _repo_path: &str,
        _pr_number: u64,
        _in_reply_to_comment_id: i64,
        _body: &str,
    ) -> AppResult<markdown_reviewer_core::domain::RemoteComment> {
        unimplemented!("not used in this test")
    }
    async fn edit_review_comment(
        &self,
        _repo_path: &str,
        _comment_id: i64,
        _body: &str,
    ) -> AppResult<markdown_reviewer_core::domain::RemoteComment> {
        unimplemented!("not used in this test")
    }
    async fn delete_review_comment(&self, _repo_path: &str, _comment_id: i64) -> AppResult<()> {
        unimplemented!("not used in this test")
    }
    async fn resolve_review_thread(
        &self,
        _repo_path: &str,
        _thread_id: &str,
    ) -> AppResult<markdown_reviewer_core::domain::RemoteThread> {
        unimplemented!("not used in this test")
    }
    async fn unresolve_review_thread(
        &self,
        _repo_path: &str,
        _thread_id: &str,
    ) -> AppResult<markdown_reviewer_core::domain::RemoteThread> {
        unimplemented!("not used in this test")
    }
```

- [ ] **Step 5: Add the same stubs to the production `GhCli` impl**

In `crates/infra/src/gh/gh_cli.rs`, at the end of `impl GhClient for GhCli`, paste the same seven method bodies with `unimplemented!("Phase 6 — implemented in later task")`. They'll be replaced in Tasks 8 and 9.

- [ ] **Step 6: Verify workspace compiles again**

Run: `cargo check --workspace --all-targets`
Expected: clean.

- [ ] **Step 7: Run existing tests to confirm no regression**

Run: `cargo test --workspace --lib`
Expected: pre-existing tests pass; new code is stubs only.

- [ ] **Step 8: Commit**

```bash
git add crates/core/src/ports/gh.rs crates/core/src/ports/mod.rs \
         crates/core/tests/comments_submit.rs crates/infra/src/gh/gh_cli.rs
git commit -m "$(cat <<'EOF'
feat(phase-6): extend GhClient port with review-thread methods

Adds list_review_threads + reply/edit/delete/resolve/unresolve.
Production impl + test fakes get unimplemented!() bodies until the
adapters land.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Sync use-case scaffold + cache migration

**Files:**
- Create: `crates/core/src/application/sync/mod.rs`
- Modify: `crates/core/src/application/mod.rs`
- Create: `crates/infra/src/sqlite/migrations/0004_remote_threads_cache.sql`
- Modify: `crates/infra/src/sqlite/connection.rs`

- [ ] **Step 1: Create the migration**

Create `crates/infra/src/sqlite/migrations/0004_remote_threads_cache.sql`:

```sql
CREATE TABLE IF NOT EXISTS remote_threads_cache (
    repo_path TEXT NOT NULL,
    pr_number INTEGER NOT NULL,
    head_sha TEXT NOT NULL,
    refreshed_at_ms INTEGER NOT NULL,
    payload_json TEXT NOT NULL,
    PRIMARY KEY (repo_path, pr_number)
);
```

- [ ] **Step 2: Register the migration**

Edit `crates/infra/src/sqlite/connection.rs` — extend `MIGRATIONS`:

```rust
const MIGRATIONS: &[(&str, &str)] = &[
    ("0001_recents", include_str!("migrations/0001_recents.sql")),
    (
        "0002_ui_state",
        include_str!("migrations/0002_ui_state.sql"),
    ),
    (
        "0003_local_comments",
        include_str!("migrations/0003_local_comments.sql"),
    ),
    (
        "0004_remote_threads_cache",
        include_str!("migrations/0004_remote_threads_cache.sql"),
    ),
];
```

- [ ] **Step 3: Create the Sync use-case bundle**

Create `crates/core/src/application/sync/mod.rs`:

```rust
pub mod cache;
pub mod mapping;
pub mod mutations;
pub mod refresh;

use std::sync::Arc;

use crate::ports::{Clock, FileResolver, GhClient, RemoteThreadsStore};

/// Ports bundle for every sync use case. Cloned from `AppState`; every field
/// is `Arc<dyn …>` so cloning is cheap.
#[derive(Clone)]
pub struct Sync {
    pub gh: Arc<dyn GhClient>,
    pub store: Arc<dyn RemoteThreadsStore>,
    pub files: Arc<dyn FileResolver>,
    pub clock: Arc<dyn Clock>,
}
```

- [ ] **Step 4: Create empty submodule files**

Create with placeholder content:

```rust
// crates/core/src/application/sync/mapping.rs
//! Pure anchor-mapping algorithm. Implemented in Task 5.
```

```rust
// crates/core/src/application/sync/refresh.rs
//! Refresh-and-cache orchestration. Implemented in Task 6.
```

```rust
// crates/core/src/application/sync/cache.rs
//! Cache hydration read path. Implemented in Task 7.
```

```rust
// crates/core/src/application/sync/mutations.rs
//! Reply/edit/delete/resolve/reopen use cases. Implemented in Task 9.
```

- [ ] **Step 5: Register the application family**

Edit `crates/core/src/application/mod.rs`:

```rust
pub mod comments;
pub mod files;
pub mod pull_requests;
pub mod repo_selection;
pub mod sync;
```

- [ ] **Step 6: Verify compile**

Run: `cargo check --workspace`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add crates/core/src/application/sync \
         crates/core/src/application/mod.rs \
         crates/infra/src/sqlite/migrations/0004_remote_threads_cache.sql \
         crates/infra/src/sqlite/connection.rs
git commit -m "$(cat <<'EOF'
feat(phase-6 #33): scaffold Sync use-case bundle and cache migration

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# Phase 1 — Anchor mapping + refresh (#31 + #34)

## Task 5: Pure anchor-mapping algorithm

**Files:**
- Modify: `crates/core/src/application/sync/mapping.rs`
- Create: `crates/core/tests/sync_mapping.rs`

- [ ] **Step 1: Write the failing tests**

Create `crates/core/tests/sync_mapping.rs`:

```rust
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
```

- [ ] **Step 2: Run tests — expect failure**

Run: `cargo test -p markdown-reviewer-core --test sync_mapping`
Expected: compile error (`map_anchor` not yet exported).

- [ ] **Step 3: Implement `map_anchor`**

Replace `crates/core/src/application/sync/mapping.rs` with:

```rust
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
        Err(AppError::FileNotFound { .. }) | Err(_) => {
            return (None, MappingStatus::FileMissing);
        }
    };
    let new = match files.read(repo_path, head_sha, &thread.path).await {
        Ok(text) => text,
        Err(_) => return (None, MappingStatus::FileMissing),
    };

    let snippet = match extract_lines(&original, start_line, end_line) {
        Some(s) => s,
        None => return (None, MappingStatus::LineMoved),
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
            out.push((start as u32) + 1);
        }
    }
    out
}
```

- [ ] **Step 4: Run the tests**

Run: `cargo test -p markdown-reviewer-core --test sync_mapping`
Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add crates/core/src/application/sync/mapping.rs \
         crates/core/tests/sync_mapping.rs
git commit -m "$(cat <<'EOF'
feat(phase-6 #31): pure anchor-mapping algorithm

Maps remote threads onto the current head via exact-commit match
or snippet relocation; falls back to MappingStatus::{Outdated,
LineMoved, Ambiguous, FileMissing} when it cannot.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `refresh::run` orchestration (#31 + #34)

**Files:**
- Modify: `crates/core/src/application/sync/refresh.rs`
- Create: `crates/core/tests/sync_refresh.rs`

- [ ] **Step 1: Write the failing tests**

Create `crates/core/tests/sync_refresh.rs`:

```rust
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
    async fn read(&self, _repo: &str, sha: &str, path: &str) -> AppResult<String> {
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
```

- [ ] **Step 2: Run — expect compile failure**

Run: `cargo test -p markdown-reviewer-core --test sync_refresh`
Expected: missing `refresh::run`.

- [ ] **Step 3: Implement `refresh::run`**

Replace `crates/core/src/application/sync/refresh.rs` with:

```rust
//! Refresh + map + cache pipeline. Always hits the network — caller is
//! responsible for invalidating React Query / SQLite cache as needed.

use crate::domain::{MappingStatus, RefreshResult, RemoteThread};
use crate::ports::CachedRefresh;
use crate::AppResult;

use super::{mapping::map_anchor, Sync};

pub async fn run(
    svc: &Sync,
    repo_path: &str,
    pr_number: u64,
    head_sha: &str,
) -> AppResult<RefreshResult> {
    let fetched = svc.gh.list_review_threads(repo_path, pr_number).await?;
    let mut mapped: Vec<RemoteThread> = Vec::new();
    let mut unmapped: Vec<RemoteThread> = Vec::new();

    for mut thread in fetched.threads {
        let (anchor, status) =
            map_anchor(&thread, head_sha, repo_path, svc.files.as_ref()).await;
        thread.anchor = anchor;
        thread.mapping_status = status.clone();
        if matches!(status, MappingStatus::Mapped) && thread.anchor.is_some() {
            mapped.push(thread);
        } else {
            unmapped.push(thread);
        }
    }

    // Deterministic ordering: file path, then start line, then thread id.
    mapped.sort_by(|a, b| {
        let a_line = a.anchor.as_ref().map(|x| x.start_line()).unwrap_or(0);
        let b_line = b.anchor.as_ref().map(|x| x.start_line()).unwrap_or(0);
        a.path
            .cmp(&b.path)
            .then(a_line.cmp(&b_line))
            .then(a.thread_id.cmp(&b.thread_id))
    });
    unmapped.sort_by(|a, b| a.path.cmp(&b.path).then(a.thread_id.cmp(&b.thread_id)));

    let refreshed_at_ms = svc.clock.now_unix_ms();
    let cached = CachedRefresh {
        head_sha: head_sha.to_string(),
        refreshed_at_ms,
        threads: mapped.clone(),
        unmapped: unmapped.clone(),
    };
    svc.store
        .put(repo_path, pr_number, head_sha, &cached)
        .await?;

    if fetched.truncated {
        tracing::warn!(
            pr_number,
            "list_review_threads truncated at 100 threads — pagination not yet implemented"
        );
    }

    Ok(RefreshResult {
        threads: mapped,
        unmapped,
        refreshed_at_ms,
    })
}
```

- [ ] **Step 4: Run the test**

Run: `cargo test -p markdown-reviewer-core --test sync_refresh`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add crates/core/src/application/sync/refresh.rs \
         crates/core/tests/sync_refresh.rs
git commit -m "$(cat <<'EOF'
feat(phase-6 #31 #34): refresh pipeline with mapped/unmapped partition

Orchestrates list_review_threads → map_anchor → cache write.
Mapped threads go to RefreshResult.threads; everything else lands
in RefreshResult.unmapped so the UI can render the unmapped section.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Cache read use case + SQLite store

**Files:**
- Modify: `crates/core/src/application/sync/cache.rs`
- Create: `crates/infra/src/sqlite/remote_threads_store.rs`
- Modify: `crates/infra/src/sqlite/mod.rs`

- [ ] **Step 1: Implement the cache read use case**

Replace `crates/core/src/application/sync/cache.rs`:

```rust
//! Read-only hydration helper for the per-PR remote-thread cache.

use crate::domain::RefreshResult;
use crate::AppResult;

use super::Sync;

pub async fn get_cached(
    svc: &Sync,
    repo_path: &str,
    pr_number: u64,
) -> AppResult<Option<RefreshResult>> {
    let row = svc.store.get(repo_path, pr_number).await?;
    Ok(row.map(|c| c.into_refresh_result()))
}
```

- [ ] **Step 2: Implement `SqliteRemoteThreadsStore`**

Create `crates/infra/src/sqlite/remote_threads_store.rs`:

```rust
use async_trait::async_trait;
use markdown_reviewer_core::ports::{CachedRefresh, RemoteThreadsStore};
use markdown_reviewer_core::{AppError, AppResult};
use rusqlite::params;

use super::Db;

pub struct SqliteRemoteThreadsStore {
    db: Db,
}

impl SqliteRemoteThreadsStore {
    pub fn new(db: Db) -> Self {
        Self { db }
    }
}

#[derive(serde::Serialize, serde::Deserialize)]
struct Payload {
    threads: Vec<markdown_reviewer_core::domain::RemoteThread>,
    unmapped: Vec<markdown_reviewer_core::domain::RemoteThread>,
}

#[async_trait]
impl RemoteThreadsStore for SqliteRemoteThreadsStore {
    async fn get(&self, repo_path: &str, pr_number: u64) -> AppResult<Option<CachedRefresh>> {
        let db = self.db.clone();
        let pr_signed = i64::try_from(pr_number).unwrap_or(i64::MAX);
        let repo = repo_path.to_string();
        tokio::task::spawn_blocking(move || {
            let conn = db.lock().map_err(|e| AppError::db(e.to_string()))?;
            let row = conn
                .query_row(
                    "SELECT head_sha, refreshed_at_ms, payload_json \
                     FROM remote_threads_cache \
                     WHERE repo_path = ?1 AND pr_number = ?2",
                    params![repo, pr_signed],
                    |r| {
                        Ok((
                            r.get::<_, String>(0)?,
                            r.get::<_, i64>(1)?,
                            r.get::<_, String>(2)?,
                        ))
                    },
                )
                .ok();
            let Some((head_sha, refreshed_at_ms, payload_json)) = row else {
                return Ok::<_, AppError>(None);
            };
            let payload: Payload = serde_json::from_str(&payload_json)
                .map_err(|e| AppError::db(format!("cache payload corrupt: {e}")))?;
            Ok(Some(CachedRefresh {
                head_sha,
                refreshed_at_ms,
                threads: payload.threads,
                unmapped: payload.unmapped,
            }))
        })
        .await
        .map_err(AppError::unexpected)?
    }

    async fn put(
        &self,
        repo_path: &str,
        pr_number: u64,
        head_sha: &str,
        cached: &CachedRefresh,
    ) -> AppResult<()> {
        let db = self.db.clone();
        let pr_signed = i64::try_from(pr_number).unwrap_or(i64::MAX);
        let repo = repo_path.to_string();
        let head = head_sha.to_string();
        let refreshed = cached.refreshed_at_ms;
        let payload = Payload {
            threads: cached.threads.clone(),
            unmapped: cached.unmapped.clone(),
        };
        let json = serde_json::to_string(&payload).expect("Payload always serializes");
        tokio::task::spawn_blocking(move || {
            let conn = db.lock().map_err(|e| AppError::db(e.to_string()))?;
            conn.execute(
                "INSERT INTO remote_threads_cache(repo_path, pr_number, head_sha, refreshed_at_ms, payload_json) \
                 VALUES (?1, ?2, ?3, ?4, ?5) \
                 ON CONFLICT(repo_path, pr_number) DO UPDATE SET \
                    head_sha = excluded.head_sha, \
                    refreshed_at_ms = excluded.refreshed_at_ms, \
                    payload_json = excluded.payload_json",
                params![repo, pr_signed, head, refreshed, json],
            )
            .map_err(AppError::db)?;
            Ok(())
        })
        .await
        .map_err(AppError::unexpected)?
    }
}
```

- [ ] **Step 3: Re-export from sqlite module**

Edit `crates/infra/src/sqlite/mod.rs`:

```rust
pub mod comments_store;
pub mod connection;
pub mod recents_store;
pub mod remote_threads_store;

pub use comments_store::SqliteCommentsStore;
pub use connection::{open_and_migrate, Db};
pub use recents_store::SqliteRecentsStore;
pub use remote_threads_store::SqliteRemoteThreadsStore;
```

- [ ] **Step 4: Add an integration smoke test**

Create `crates/infra/tests/sqlite_remote_threads.rs`:

```rust
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
```

- [ ] **Step 5: Run the tests**

Run: `cargo test -p markdown-reviewer-core --test sync_refresh` (still green)
Run: `cargo test -p markdown-reviewer-infra --test sqlite_remote_threads`
Expected: both green.

- [ ] **Step 6: Commit**

```bash
git add crates/core/src/application/sync/cache.rs \
         crates/infra/src/sqlite/remote_threads_store.rs \
         crates/infra/src/sqlite/mod.rs \
         crates/infra/tests/sqlite_remote_threads.rs
git commit -m "$(cat <<'EOF'
feat(phase-6 #33): SqliteRemoteThreadsStore + get_cached use case

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# Phase 2 — Production `gh` adapter

## Task 8: Implement `list_review_threads` (GraphQL)

**Files:**
- Modify: `crates/infra/src/gh/gh_cli.rs`
- Create: `crates/infra/src/gh/review_threads.rs`
- Modify: `crates/infra/src/gh/mod.rs`
- Create: `crates/infra/tests/fixtures/gh/review-threads-basic.json`
- Create: `crates/infra/tests/gh_review_threads.rs`

- [ ] **Step 1: Add a fixture**

Create `crates/infra/tests/fixtures/gh/review-threads-basic.json`. Hand-craft a minimal but realistic GraphQL response with 2 threads (one open, one resolved, with multi-line range and viewerCan* flags):

```json
{
  "data": {
    "repository": {
      "pullRequest": {
        "reviewThreads": {
          "pageInfo": { "hasNextPage": false, "endCursor": null },
          "nodes": [
            {
              "id": "PRRT_kwDOA1",
              "path": "docs/intro.md",
              "originalLine": 4,
              "originalStartLine": null,
              "line": 4,
              "startLine": null,
              "isOutdated": false,
              "isResolved": false,
              "viewerCanResolve": true,
              "viewerCanUnresolve": false,
              "comments": {
                "nodes": [
                  {
                    "databaseId": 1001,
                    "author": { "login": "alice", "avatarUrl": "https://avatars/alice" },
                    "body": "Typo here",
                    "createdAt": "2026-05-01T10:00:00Z",
                    "updatedAt": "2026-05-01T10:00:00Z",
                    "viewerCanUpdate": true,
                    "viewerCanDelete": true,
                    "url": "https://github.com/org/repo/pull/7#discussion_r1001",
                    "originalCommit": { "oid": "abc123" }
                  }
                ]
              }
            },
            {
              "id": "PRRT_kwDOA2",
              "path": "docs/intro.md",
              "originalLine": 10,
              "originalStartLine": 8,
              "line": 10,
              "startLine": 8,
              "isOutdated": false,
              "isResolved": true,
              "viewerCanResolve": false,
              "viewerCanUnresolve": true,
              "comments": {
                "nodes": [
                  {
                    "databaseId": 1002,
                    "author": { "login": "bob", "avatarUrl": "https://avatars/bob" },
                    "body": "Range comment",
                    "createdAt": "2026-05-01T11:00:00Z",
                    "updatedAt": "2026-05-01T11:30:00Z",
                    "viewerCanUpdate": false,
                    "viewerCanDelete": false,
                    "url": "https://github.com/org/repo/pull/7#discussion_r1002",
                    "originalCommit": { "oid": "abc123" }
                  }
                ]
              }
            }
          ]
        }
      }
    }
  }
}
```

- [ ] **Step 2: Write the failing parser test**

Create `crates/infra/tests/gh_review_threads.rs`:

```rust
//! Parser tests for the GraphQL `reviewThreads` payload. The fixture is
//! a hand-crafted but realistic response; the `gh_cli` round-trip is
//! covered by an opt-in #[ignore] smoke test below.

use markdown_reviewer_core::domain::ThreadState;
use markdown_reviewer_infra::gh::review_threads::parse_review_threads;

#[test]
fn parses_basic_fixture() {
    let raw = include_str!("fixtures/gh/review-threads-basic.json");
    let fetched = parse_review_threads(raw).expect("fixture parses");
    assert_eq!(fetched.threads.len(), 2);
    assert!(!fetched.truncated);

    let t1 = &fetched.threads[0];
    assert_eq!(t1.thread_id, "PRRT_kwDOA1");
    assert_eq!(t1.path, "docs/intro.md");
    assert_eq!(t1.line, Some(4));
    assert_eq!(t1.start_line, None);
    assert_eq!(t1.original_line, 4);
    assert_eq!(t1.state, ThreadState::Open);
    assert!(t1.viewer_can_resolve);
    assert_eq!(t1.comments.len(), 1);
    assert_eq!(t1.comments[0].comment_id, 1001);
    assert_eq!(t1.comments[0].author, "alice");
    assert!(t1.comments[0].viewer_can_update);

    let t2 = &fetched.threads[1];
    assert_eq!(t2.thread_id, "PRRT_kwDOA2");
    assert_eq!(t2.state, ThreadState::Resolved);
    assert_eq!(t2.start_line, Some(8));
    assert_eq!(t2.line, Some(10));
    assert!(!t2.comments[0].viewer_can_update);
}
```

- [ ] **Step 3: Run — expect compile failure (missing `parse_review_threads`)**

Run: `cargo test -p markdown-reviewer-infra --test gh_review_threads`
Expected: error.

- [ ] **Step 4: Implement the parser**

Create `crates/infra/src/gh/review_threads.rs`:

```rust
//! Parses the GraphQL `reviewThreads` payload returned by
//! `gh api graphql -F query=…`. Stays self-contained so a fixture-based
//! test can run without going through the gh CLI.

use markdown_reviewer_core::domain::{
    MappingStatus, RemoteComment, RemoteThread, ThreadState,
};
use markdown_reviewer_core::ports::FetchedReviewThreads;
use markdown_reviewer_core::{AppError, AppResult};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct Envelope {
    data: Data,
}

#[derive(Debug, Deserialize)]
struct Data {
    repository: Repo,
}

#[derive(Debug, Deserialize)]
struct Repo {
    #[serde(rename = "pullRequest")]
    pull_request: Pr,
}

#[derive(Debug, Deserialize)]
struct Pr {
    #[serde(rename = "reviewThreads")]
    review_threads: Threads,
}

#[derive(Debug, Deserialize)]
struct Threads {
    #[serde(rename = "pageInfo")]
    page_info: PageInfo,
    nodes: Vec<ThreadNode>,
}

#[derive(Debug, Deserialize)]
struct PageInfo {
    #[serde(rename = "hasNextPage")]
    has_next_page: bool,
}

#[derive(Debug, Deserialize)]
struct ThreadNode {
    id: String,
    path: String,
    #[serde(rename = "originalLine")]
    original_line: u32,
    #[serde(rename = "originalStartLine")]
    original_start_line: Option<u32>,
    line: Option<u32>,
    #[serde(rename = "startLine")]
    start_line: Option<u32>,
    #[serde(rename = "isOutdated")]
    is_outdated: bool,
    #[serde(rename = "isResolved")]
    is_resolved: bool,
    #[serde(rename = "viewerCanResolve")]
    viewer_can_resolve: bool,
    #[serde(rename = "viewerCanUnresolve")]
    viewer_can_unresolve: bool,
    comments: Comments,
}

#[derive(Debug, Deserialize)]
struct Comments {
    nodes: Vec<CommentNode>,
}

#[derive(Debug, Deserialize)]
struct CommentNode {
    #[serde(rename = "databaseId")]
    database_id: i64,
    author: Option<Author>,
    body: String,
    #[serde(rename = "createdAt")]
    created_at: String,
    #[serde(rename = "updatedAt")]
    updated_at: String,
    #[serde(rename = "viewerCanUpdate")]
    viewer_can_update: bool,
    #[serde(rename = "viewerCanDelete")]
    viewer_can_delete: bool,
    url: String,
    #[serde(rename = "originalCommit")]
    original_commit: Option<Commit>,
}

#[derive(Debug, Deserialize)]
struct Author {
    login: String,
    #[serde(rename = "avatarUrl")]
    avatar_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct Commit {
    oid: String,
}

pub fn parse_review_threads(raw: &str) -> AppResult<FetchedReviewThreads> {
    let env: Envelope = serde_json::from_str(raw)
        .map_err(|e| AppError::process(format!("gh api graphql reviewThreads: {e}")))?;
    let threads = env
        .data
        .repository
        .pull_request
        .review_threads
        .nodes
        .into_iter()
        .map(into_thread)
        .collect();
    Ok(FetchedReviewThreads {
        threads,
        truncated: env.data.repository.pull_request.review_threads.page_info.has_next_page,
    })
}

fn into_thread(n: ThreadNode) -> RemoteThread {
    // Original commit is taken from the *first* comment's `originalCommit.oid`
    // — GraphQL doesn't expose it directly on the thread. Empty when missing
    // (degenerate payload); the mapping layer will fall through to LineMoved.
    let original_commit_id = n
        .comments
        .nodes
        .first()
        .and_then(|c| c.original_commit.as_ref())
        .map(|c| c.oid.clone())
        .unwrap_or_default();

    let comments = n.comments.nodes.into_iter().map(into_comment).collect();
    RemoteThread {
        thread_id: n.id,
        path: n.path,
        original_commit_id,
        line: n.line,
        start_line: n.start_line,
        original_line: n.original_line,
        original_start_line: n.original_start_line,
        state: if n.is_resolved {
            ThreadState::Resolved
        } else {
            ThreadState::Open
        },
        is_outdated: n.is_outdated,
        viewer_can_resolve: n.viewer_can_resolve,
        viewer_can_unresolve: n.viewer_can_unresolve,
        comments,
        anchor: None,
        mapping_status: MappingStatus::Mapped, // overwritten by map_anchor
    }
}

fn into_comment(c: CommentNode) -> RemoteComment {
    let (author, avatar) = match c.author {
        Some(a) => (a.login, a.avatar_url),
        None => ("ghost".into(), None),
    };
    RemoteComment {
        comment_id: c.database_id,
        author,
        author_avatar_url: avatar,
        body: c.body,
        created_at: c.created_at,
        updated_at: c.updated_at,
        viewer_can_update: c.viewer_can_update,
        viewer_can_delete: c.viewer_can_delete,
        html_url: c.url,
    }
}

/// Static GraphQL query used by both `list_review_threads` and the
/// post-mutation refetch helpers. Variables: `$owner: String!`,
/// `$name: String!`, `$pr: Int!`.
pub const REVIEW_THREADS_QUERY: &str = r#"
query($owner: String!, $name: String!, $pr: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $pr) {
      reviewThreads(first: 100) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          path
          originalLine
          originalStartLine
          line
          startLine
          isOutdated
          isResolved
          viewerCanResolve
          viewerCanUnresolve
          comments(first: 100) {
            nodes {
              databaseId
              author { login avatarUrl }
              body
              createdAt
              updatedAt
              viewerCanUpdate
              viewerCanDelete
              url
              originalCommit { oid }
            }
          }
        }
      }
    }
  }
}
"#;
```

- [ ] **Step 5: Re-export from `gh/mod.rs`**

Edit `crates/infra/src/gh/mod.rs`:

```rust
pub mod gh_cli;
pub mod review_threads;

pub use gh_cli::GhCli;
```

- [ ] **Step 6: Wire `GhCli::list_review_threads` to hit `gh api graphql`**

Find the `unimplemented!()` body for `list_review_threads` inside `crates/infra/src/gh/gh_cli.rs` and replace with:

```rust
    async fn list_review_threads(
        &self,
        repo_path: &str,
        pr_number: u64,
    ) -> AppResult<markdown_reviewer_core::ports::FetchedReviewThreads> {
        // We need the (owner, name) tuple. `gh repo view` is the cheapest way
        // to get it from the cwd — same pattern used elsewhere.
        let owner_arg = "owner=".to_string();
        let name_arg = "name=".to_string();
        let _ = (owner_arg, name_arg); // placeholder so the snippet below shows intent

        let query_arg = format!("query={}", crate::gh::review_threads::REVIEW_THREADS_QUERY);
        let pr_arg = format!("-F=pr={pr_number}");
        // gh fills `{owner}` / `{repo}` from the cwd when we use `-F owner={owner}` style,
        // but graphql variables need explicit values. `gh api graphql` accepts
        // `-F owner=:owner -F name=:repo` shortcuts that expand against the
        // current repo — use them to avoid a second round-trip.
        let args: Vec<&str> = vec![
            "api",
            "graphql",
            "-F",
            "owner=:owner",
            "-F",
            "name=:repo",
            &pr_arg,
            "--raw-field",
            &query_arg,
        ];
        let out = run("gh", &args, Some(repo_path), PR_TIMEOUT_MS).await?;
        if !out.ok() {
            return Err(map_gh_error(&out.stderr, Some(pr_number)));
        }
        crate::gh::review_threads::parse_review_threads(out.stdout.trim())
    }
```

- [ ] **Step 7: Run the parser test (fixture-only — no `gh` needed)**

Run: `cargo test -p markdown-reviewer-infra --test gh_review_threads`
Expected: pass.

- [ ] **Step 8: Run workspace tests to confirm nothing else broke**

Run: `cargo test --workspace --lib`
Expected: pass.

- [ ] **Step 9: Commit**

```bash
git add crates/infra/src/gh/review_threads.rs \
         crates/infra/src/gh/mod.rs \
         crates/infra/src/gh/gh_cli.rs \
         crates/infra/tests/fixtures/gh/review-threads-basic.json \
         crates/infra/tests/gh_review_threads.rs
git commit -m "$(cat <<'EOF'
feat(phase-6 #31): GhCli::list_review_threads via GraphQL

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Implement remote mutations + use cases (#32)

**Files:**
- Modify: `crates/infra/src/gh/gh_cli.rs`
- Create: `crates/core/src/application/sync/mutations.rs`
- Create: `crates/core/tests/sync_mutations.rs`

- [ ] **Step 1: Write the failing use-case tests**

Create `crates/core/tests/sync_mutations.rs`:

```rust
//! Use-case tests for sync::mutations. Confirms each call delegates to the
//! GhClient with the right arguments and propagates viewer-denied errors as
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
```

- [ ] **Step 2: Run — expect failure**

Run: `cargo test -p markdown-reviewer-core --test sync_mutations`
Expected: compile error (mutations module empty).

- [ ] **Step 3: Implement the use cases**

Replace `crates/core/src/application/sync/mutations.rs`:

```rust
//! Reply / edit / delete / resolve / reopen use cases. Each one is a thin
//! delegation to the `GhClient` port; the only logic here is choosing
//! between the resolve and unresolve mutations.

use crate::domain::{RemoteComment, RemoteThread};
use crate::AppResult;

use super::Sync;

pub async fn reply(
    svc: &Sync,
    repo_path: &str,
    pr_number: u64,
    in_reply_to_comment_id: i64,
    body: &str,
) -> AppResult<RemoteComment> {
    svc.gh
        .reply_review_comment(repo_path, pr_number, in_reply_to_comment_id, body)
        .await
}

pub async fn edit(
    svc: &Sync,
    repo_path: &str,
    comment_id: i64,
    body: &str,
) -> AppResult<RemoteComment> {
    svc.gh
        .edit_review_comment(repo_path, comment_id, body)
        .await
}

pub async fn delete(svc: &Sync, repo_path: &str, comment_id: i64) -> AppResult<()> {
    svc.gh.delete_review_comment(repo_path, comment_id).await
}

pub async fn resolve(svc: &Sync, repo_path: &str, thread_id: &str) -> AppResult<RemoteThread> {
    svc.gh.resolve_review_thread(repo_path, thread_id).await
}

pub async fn reopen(svc: &Sync, repo_path: &str, thread_id: &str) -> AppResult<RemoteThread> {
    svc.gh.unresolve_review_thread(repo_path, thread_id).await
}
```

- [ ] **Step 4: Run the use-case tests**

Run: `cargo test -p markdown-reviewer-core --test sync_mutations`
Expected: 5 tests pass.

- [ ] **Step 5: Implement the production `GhCli` mutation methods**

Replace the `unimplemented!()` bodies in `crates/infra/src/gh/gh_cli.rs` for:

```rust
    async fn reply_review_comment(
        &self,
        repo_path: &str,
        pr_number: u64,
        in_reply_to_comment_id: i64,
        body: &str,
    ) -> AppResult<markdown_reviewer_core::domain::RemoteComment> {
        let endpoint = format!("repos/{{owner}}/{{repo}}/pulls/{pr_number}/comments");
        let in_reply_arg = format!("in_reply_to={in_reply_to_comment_id}");
        let body_arg = format!("body={body}");
        let args = vec![
            "api",
            "-X",
            "POST",
            &endpoint,
            "-F",
            &in_reply_arg,
            "--raw-field",
            &body_arg,
        ];
        let out = run("gh", &args, Some(repo_path), REVIEW_COMMENT_TIMEOUT_MS).await?;
        if !out.ok() {
            return Err(classify_rest_error(&out.stderr));
        }
        parse_review_comment(out.stdout.trim())
    }

    async fn edit_review_comment(
        &self,
        repo_path: &str,
        comment_id: i64,
        body: &str,
    ) -> AppResult<markdown_reviewer_core::domain::RemoteComment> {
        let endpoint = format!("repos/{{owner}}/{{repo}}/pulls/comments/{comment_id}");
        let body_arg = format!("body={body}");
        let args = vec![
            "api",
            "-X",
            "PATCH",
            &endpoint,
            "--raw-field",
            &body_arg,
        ];
        let out = run("gh", &args, Some(repo_path), REVIEW_COMMENT_TIMEOUT_MS).await?;
        if !out.ok() {
            return Err(classify_rest_error(&out.stderr));
        }
        parse_review_comment(out.stdout.trim())
    }

    async fn delete_review_comment(&self, repo_path: &str, comment_id: i64) -> AppResult<()> {
        let endpoint = format!("repos/{{owner}}/{{repo}}/pulls/comments/{comment_id}");
        let args = vec!["api", "-X", "DELETE", &endpoint];
        let out = run("gh", &args, Some(repo_path), REVIEW_COMMENT_TIMEOUT_MS).await?;
        if !out.ok() {
            return Err(classify_rest_error(&out.stderr));
        }
        Ok(())
    }

    async fn resolve_review_thread(
        &self,
        repo_path: &str,
        thread_id: &str,
    ) -> AppResult<markdown_reviewer_core::domain::RemoteThread> {
        run_thread_mutation(
            repo_path,
            thread_id,
            "mutation($id: ID!) { resolveReviewThread(input: { threadId: $id }) { thread { id } } }",
        )
        .await?;
        refetch_thread(repo_path, thread_id).await
    }

    async fn unresolve_review_thread(
        &self,
        repo_path: &str,
        thread_id: &str,
    ) -> AppResult<markdown_reviewer_core::domain::RemoteThread> {
        run_thread_mutation(
            repo_path,
            thread_id,
            "mutation($id: ID!) { unresolveReviewThread(input: { threadId: $id }) { thread { id } } }",
        )
        .await?;
        refetch_thread(repo_path, thread_id).await
    }
```

Add the four helpers at the bottom of `gh_cli.rs` (before the existing `BatchCommentSlot` struct):

```rust
fn classify_rest_error(stderr: &str) -> AppError {
    let lower = stderr.to_ascii_lowercase();
    if lower.contains("status code: 403") || lower.contains("must have write access")
        || lower.contains("must be the author")
    {
        return AppError::validation("read-only on GitHub");
    }
    if lower.contains("status code: 404") || lower.contains("not found") {
        return AppError::validation("upstream thread no longer exists");
    }
    if lower.contains("authentication required") || lower.contains("gh auth login") {
        return AppError::GhNotAuthenticated;
    }
    AppError::process(redact(stderr.trim()))
}

fn parse_review_comment(raw: &str) -> AppResult<markdown_reviewer_core::domain::RemoteComment> {
    #[derive(serde::Deserialize)]
    struct UserField { login: String, avatar_url: Option<String> }
    #[derive(serde::Deserialize)]
    struct RawComment {
        id: i64,
        user: Option<UserField>,
        body: String,
        created_at: String,
        updated_at: String,
        html_url: String,
        #[serde(default)] author_association: Option<String>,
    }
    let c: RawComment = serde_json::from_str(raw)
        .map_err(|e| AppError::process(format!("gh api comments: invalid JSON: {e}")))?;
    let viewer_can_update = matches!(
        c.author_association.as_deref(),
        Some("OWNER" | "MEMBER" | "COLLABORATOR" | "CONTRIBUTOR")
    );
    let (author, avatar) = match c.user {
        Some(u) => (u.login, u.avatar_url),
        None => ("ghost".into(), None),
    };
    Ok(markdown_reviewer_core::domain::RemoteComment {
        comment_id: c.id,
        author,
        author_avatar_url: avatar,
        body: c.body,
        created_at: c.created_at,
        updated_at: c.updated_at,
        viewer_can_update,
        viewer_can_delete: viewer_can_update,
        html_url: c.html_url,
    })
}

async fn run_thread_mutation(repo_path: &str, thread_id: &str, mutation: &str) -> AppResult<()> {
    let query_arg = format!("query={mutation}");
    let id_arg = format!("id={thread_id}");
    let args = vec![
        "api",
        "graphql",
        "--raw-field",
        &query_arg,
        "--raw-field",
        &id_arg,
    ];
    let out = run("gh", &args, Some(repo_path), REVIEW_COMMENT_TIMEOUT_MS).await?;
    if !out.ok() {
        return Err(classify_rest_error(&out.stderr));
    }
    if out.stdout.contains("\"errors\":") {
        return Err(AppError::process(format!(
            "graphql mutation failed: {}",
            redact(out.stdout.trim())
        )));
    }
    Ok(())
}

async fn refetch_thread(
    repo_path: &str,
    thread_id: &str,
) -> AppResult<markdown_reviewer_core::domain::RemoteThread> {
    // We re-fetch every thread (cheap: usually < 100) and find ours by id.
    // The mutation endpoint itself doesn't return enough data for the UI.
    use markdown_reviewer_core::domain::MappingStatus;
    let query_arg = format!("query={}", crate::gh::review_threads::REVIEW_THREADS_QUERY);
    // We need owner/name/pr to refetch. The thread id alone is enough for a
    // single-node query: `node(id: ...) { ... on PullRequestReviewThread { ... } }`.
    // That avoids parsing owner/name out of the caller path.
    let single_query = format!(
        r#"query($id: ID!) {{ node(id: $id) {{ ... on PullRequestReviewThread {{
            id path originalLine originalStartLine line startLine
            isOutdated isResolved viewerCanResolve viewerCanUnresolve
            comments(first: 100) {{ nodes {{
                databaseId author {{ login avatarUrl }} body createdAt updatedAt
                viewerCanUpdate viewerCanDelete url originalCommit {{ oid }}
            }} }}
        }} }} }}"#
    );
    let _ = query_arg;
    let q_arg = format!("query={single_query}");
    let id_arg = format!("id={thread_id}");
    let args = vec![
        "api",
        "graphql",
        "--raw-field",
        &q_arg,
        "--raw-field",
        &id_arg,
    ];
    let out = run("gh", &args, Some(repo_path), REVIEW_COMMENT_TIMEOUT_MS).await?;
    if !out.ok() {
        return Err(classify_rest_error(&out.stderr));
    }
    #[derive(serde::Deserialize)]
    struct Envelope { data: Data }
    #[derive(serde::Deserialize)]
    struct Data { node: serde_json::Value }
    let env: Envelope = serde_json::from_str(out.stdout.trim())
        .map_err(|e| AppError::process(format!("gh graphql node: {e}")))?;
    // Wrap the single node into the shape `parse_review_threads` expects so we
    // can reuse the parser.
    let wrapped = serde_json::json!({
        "data": {
            "repository": {
                "pullRequest": {
                    "reviewThreads": {
                        "pageInfo": { "hasNextPage": false, "endCursor": null },
                        "nodes": [env.node]
                    }
                }
            }
        }
    });
    let fetched = crate::gh::review_threads::parse_review_threads(&wrapped.to_string())?;
    let mut thread = fetched
        .threads
        .into_iter()
        .next()
        .ok_or_else(|| AppError::process("graphql node returned no thread"))?;
    thread.mapping_status = MappingStatus::Mapped;
    Ok(thread)
}
```

- [ ] **Step 6: Run workspace tests**

Run: `cargo test --workspace --lib`
Expected: pass.

- [ ] **Step 7: Run clippy**

Run: `cargo clippy --workspace --all-targets -- -D warnings`
Expected: clean. Fix any warnings inline (likely small lifetime / borrow issues).

- [ ] **Step 8: Commit**

```bash
git add crates/infra/src/gh/gh_cli.rs \
         crates/core/src/application/sync/mutations.rs \
         crates/core/tests/sync_mutations.rs
git commit -m "$(cat <<'EOF'
feat(phase-6 #32): remote mutations (reply/edit/delete/resolve/reopen)

GhCli implements the REST + GraphQL endpoints; viewer-denied
responses get mapped to AppError::Validation so the UI can show
a read-only tooltip.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# Phase 3 — IPC surface + bootstrap

## Task 10: IPC commands + bootstrap wiring

**Files:**
- Create: `crates/ipc/src/commands/sync.rs`
- Modify: `crates/ipc/src/commands/mod.rs`
- Modify: `crates/ipc/src/state.rs`
- Modify: `crates/ipc/src/lib.rs`
- Create: `crates/infra/src/gh/file_resolver.rs`
- Modify: `crates/infra/src/gh/mod.rs`
- Modify: `crates/infra/src/lib.rs`
- Modify: `src-tauri/src/bootstrap.rs`

- [ ] **Step 1: Production `FileResolver`**

Create `crates/infra/src/gh/file_resolver.rs`:

```rust
//! Production `FileResolver`. Tries the local clone first; falls back to
//! `gh api contents` when the ref isn't in the working tree.

use std::sync::Arc;

use async_trait::async_trait;
use markdown_reviewer_core::ports::{FileResolver, GhClient, GitClient};
use markdown_reviewer_core::{AppError, AppResult};

pub struct GitWithGhFallback {
    pub git: Arc<dyn GitClient>,
    pub gh: Arc<dyn GhClient>,
}

#[async_trait]
impl FileResolver for GitWithGhFallback {
    async fn read(&self, repo_path: &str, sha: &str, path: &str) -> AppResult<String> {
        match self.git.show(repo_path, sha, path).await {
            Ok(text) => Ok(text),
            Err(AppError::FileNotFound { .. }) | Err(AppError::Process { .. }) => {
                self.gh.get_file_content(repo_path, sha, path).await
            }
            Err(other) => Err(other),
        }
    }
}
```

- [ ] **Step 2: Confirm `GitClient::show` exists**

Run: `grep -n "fn show" crates/core/src/ports/git.rs crates/infra/src/git/git_cli.rs`
Expected: a `show(repo_path, sha, path)` method. If it returns a different signature, adapt the resolver above to match. If it doesn't exist, replace the `git.show` call with the existing `read_blob` / equivalent method already used by `application::files::read_markdown`.

- [ ] **Step 3: Re-export from `infra/src/gh/mod.rs` and from the crate root**

```rust
// crates/infra/src/gh/mod.rs
pub mod file_resolver;
pub mod gh_cli;
pub mod review_threads;

pub use file_resolver::GitWithGhFallback;
pub use gh_cli::GhCli;
```

In `crates/infra/src/lib.rs` (already re-exports `GhCli`), add:

```rust
pub use gh::GitWithGhFallback;
```

- [ ] **Step 4: Add the IPC command module**

Create `crates/ipc/src/commands/sync.rs`:

```rust
use markdown_reviewer_core::application::sync::{cache, mutations, refresh};
use markdown_reviewer_core::domain::{RefreshResult, RemoteComment, RemoteThread};
use markdown_reviewer_core::AppError;
use tauri::State;

use crate::state::AppState;

#[tauri::command(rename_all = "camelCase")]
pub async fn refresh_remote_comments(
    state: State<'_, AppState>,
    repo_path: String,
    pr_number: u64,
    head_sha: String,
) -> Result<RefreshResult, AppError> {
    refresh::run(&state.sync, &repo_path, pr_number, &head_sha).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn get_cached_remote_threads(
    state: State<'_, AppState>,
    repo_path: String,
    pr_number: u64,
) -> Result<Option<RefreshResult>, AppError> {
    cache::get_cached(&state.sync, &repo_path, pr_number).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn reply_remote_thread(
    state: State<'_, AppState>,
    repo_path: String,
    pr_number: u64,
    in_reply_to_comment_id: i64,
    body: String,
) -> Result<RemoteComment, AppError> {
    mutations::reply(&state.sync, &repo_path, pr_number, in_reply_to_comment_id, &body).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn edit_remote_comment(
    state: State<'_, AppState>,
    repo_path: String,
    comment_id: i64,
    body: String,
) -> Result<RemoteComment, AppError> {
    mutations::edit(&state.sync, &repo_path, comment_id, &body).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn delete_remote_comment(
    state: State<'_, AppState>,
    repo_path: String,
    comment_id: i64,
) -> Result<(), AppError> {
    mutations::delete(&state.sync, &repo_path, comment_id).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn resolve_remote_thread(
    state: State<'_, AppState>,
    repo_path: String,
    thread_id: String,
) -> Result<RemoteThread, AppError> {
    mutations::resolve(&state.sync, &repo_path, &thread_id).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn reopen_remote_thread(
    state: State<'_, AppState>,
    repo_path: String,
    thread_id: String,
) -> Result<RemoteThread, AppError> {
    mutations::reopen(&state.sync, &repo_path, &thread_id).await
}
```

- [ ] **Step 5: Register the module**

Edit `crates/ipc/src/commands/mod.rs`:

```rust
pub mod comments;
pub mod files;
pub mod pull_requests;
pub mod recents;
pub mod repo;
pub mod sync;
pub mod tools;
```

- [ ] **Step 6: Extend `AppState`**

Edit `crates/ipc/src/state.rs`:

```rust
use markdown_reviewer_core::application::comments::Comments;
use markdown_reviewer_core::application::files::Files;
use markdown_reviewer_core::application::pull_requests::PullRequests;
use markdown_reviewer_core::application::repo_selection::RepoSelection;
use markdown_reviewer_core::application::sync::Sync;

#[derive(Clone)]
pub struct AppState {
    pub repo_selection: RepoSelection,
    pub pull_requests: PullRequests,
    pub files: Files,
    pub comments: Comments,
    pub sync: Sync,
}
```

- [ ] **Step 7: Register handlers**

Edit `crates/ipc/src/lib.rs` — extend `generate_handler![…]` with the seven new commands at the end:

```rust
        commands::sync::refresh_remote_comments,
        commands::sync::get_cached_remote_threads,
        commands::sync::reply_remote_thread,
        commands::sync::edit_remote_comment,
        commands::sync::delete_remote_comment,
        commands::sync::resolve_remote_thread,
        commands::sync::reopen_remote_thread,
```

- [ ] **Step 8: Wire bootstrap**

Edit `src-tauri/src/bootstrap.rs` — extend the `AppState` construction:

```rust
            use markdown_reviewer_infra::{sqlite::SqliteRemoteThreadsStore, GitWithGhFallback};
            use markdown_reviewer_core::application::sync::Sync;

            let remote_store = Arc::new(SqliteRemoteThreadsStore::new(db.clone()));
            let file_resolver = Arc::new(GitWithGhFallback {
                git: git.clone(),
                gh: gh.clone(),
            });
            // … inside `let state = AppState { … }` add:
            sync: Sync {
                gh: gh.clone(),
                store: remote_store,
                files: file_resolver,
                clock: clock.clone(),
            },
```

(The existing `db` binding is moved into `SqliteRecentsStore::new(db)` later, so move the `db.clone()` calls accordingly to keep ownership consistent.)

- [ ] **Step 9: Build the whole workspace + Tauri**

Run: `cargo check --workspace --all-targets`
Expected: clean.

Run: `cargo build -p markdown-reviewer-tauri --bin markdown-reviewer-tauri`
Expected: success.

- [ ] **Step 10: Confirm no new capability needed**

Tauri v2 derives the IPC allowlist from the `generate_handler!` macro — no edit to `capabilities/default.json` should be required. Verify by grepping for any explicit per-command `allow-…` entry and ensuring none reference the new names.

- [ ] **Step 11: Commit**

```bash
git add crates/ipc/src/commands/sync.rs \
         crates/ipc/src/commands/mod.rs \
         crates/ipc/src/state.rs \
         crates/ipc/src/lib.rs \
         crates/infra/src/gh/file_resolver.rs \
         crates/infra/src/gh/mod.rs \
         crates/infra/src/lib.rs \
         src-tauri/src/bootstrap.rs
git commit -m "$(cat <<'EOF'
feat(phase-6): IPC commands + bootstrap for sync

Wires the seven new sync commands and the SqliteRemoteThreadsStore +
GitWithGhFallback file resolver into AppState.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# Phase 4 — Frontend foundation

## Task 11: TypeScript IPC contract + client helpers

**Files:**
- Modify: `src/shared/ipc/contract.ts`
- Modify: `src/shared/ipc/client.ts`

- [ ] **Step 1: Extend `contract.ts`**

Append after the existing `ReviewSubmissionResult` interface block:

```ts
export type ThreadState = "open" | "resolved";

export type MappingStatus =
  | { kind: "mapped" }
  | { kind: "outdated"; reason: string }
  | { kind: "fileMissing" }
  | { kind: "lineMoved" }
  | { kind: "ambiguous" };

export interface RemoteComment {
  commentId: number;
  author: string;
  authorAvatarUrl: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
  viewerCanUpdate: boolean;
  viewerCanDelete: boolean;
  htmlUrl: string;
}

export interface RemoteThread {
  threadId: string;
  path: string;
  originalCommitId: string;
  line: number | null;
  startLine: number | null;
  originalLine: number;
  originalStartLine: number | null;
  state: ThreadState;
  isOutdated: boolean;
  viewerCanResolve: boolean;
  viewerCanUnresolve: boolean;
  comments: RemoteComment[];
  anchor: CommentAnchor | null;
  mappingStatus: MappingStatus;
}

export interface RefreshResult {
  threads: RemoteThread[];
  unmapped: RemoteThread[];
  refreshedAtMs: number;
}
```

Then extend the `Commands` interface:

```ts
  refresh_remote_comments: {
    args: { repoPath: string; prNumber: number; headSha: string };
    result: RefreshResult;
  };
  get_cached_remote_threads: {
    args: { repoPath: string; prNumber: number };
    result: RefreshResult | null;
  };
  reply_remote_thread: {
    args: { repoPath: string; prNumber: number; inReplyToCommentId: number; body: string };
    result: RemoteComment;
  };
  edit_remote_comment: {
    args: { repoPath: string; commentId: number; body: string };
    result: RemoteComment;
  };
  delete_remote_comment: {
    args: { repoPath: string; commentId: number };
    result: null;
  };
  resolve_remote_thread: {
    args: { repoPath: string; threadId: string };
    result: RemoteThread;
  };
  reopen_remote_thread: {
    args: { repoPath: string; threadId: string };
    result: RemoteThread;
  };
```

- [ ] **Step 2: Extend `client.ts`**

Open `src/shared/ipc/client.ts`, find the `ipc` object, and add a `sync` namespace mirroring the existing `comments` / `repo` / `pullRequests` namespaces. Use the existing `call(...)` wrapper. Example:

```ts
import type { RefreshResult, RemoteComment, RemoteThread } from "./contract";

export const ipc = {
  // … existing namespaces unchanged …
  sync: {
    refresh(repoPath: string, prNumber: number, headSha: string) {
      return call("refresh_remote_comments", { repoPath, prNumber, headSha });
    },
    getCached(repoPath: string, prNumber: number) {
      return call("get_cached_remote_threads", { repoPath, prNumber });
    },
    reply(repoPath: string, prNumber: number, inReplyToCommentId: number, body: string) {
      return call("reply_remote_thread", { repoPath, prNumber, inReplyToCommentId, body });
    },
    edit(repoPath: string, commentId: number, body: string) {
      return call("edit_remote_comment", { repoPath, commentId, body });
    },
    delete(repoPath: string, commentId: number) {
      return call("delete_remote_comment", { repoPath, commentId });
    },
    resolve(repoPath: string, threadId: string) {
      return call("resolve_remote_thread", { repoPath, threadId });
    },
    reopen(repoPath: string, threadId: string) {
      return call("reopen_remote_thread", { repoPath, threadId });
    },
  },
};
```

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/shared/ipc/contract.ts src/shared/ipc/client.ts
git commit -m "$(cat <<'EOF'
feat(phase-6): TS contract + client helpers for sync IPC

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: `mergeLocalAndRemote` + tests

**Files:**
- Create: `src/features/sync/lib/mergeLocalAndRemote.ts`
- Create: `src/features/sync/lib/mergeLocalAndRemote.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/sync/lib/mergeLocalAndRemote.test.ts`:

```ts
import { test, expect } from "bun:test";
import type { RemoteThread, ReviewComment } from "@/shared/ipc/contract";
import { mergeLocalAndRemote } from "./mergeLocalAndRemote";

function local(id: number, githubId: number | null = null): ReviewComment {
  return {
    id,
    prNumber: 7,
    filePath: "doc.md",
    headSha: "abc",
    body: "local body",
    author: "me",
    state: githubId ? "submitted" : "draft",
    anchor: { kind: "singleLine", line: 4 },
    createdAt: 0,
    updatedAt: 0,
    githubId,
    submitError: null,
  };
}

function remote(id: string, commentId: number, line: number): RemoteThread {
  return {
    threadId: id,
    path: "doc.md",
    originalCommitId: "abc",
    line,
    startLine: null,
    originalLine: line,
    originalStartLine: null,
    state: "open",
    isOutdated: false,
    viewerCanResolve: true,
    viewerCanUnresolve: false,
    comments: [
      {
        commentId,
        author: "alice",
        authorAvatarUrl: null,
        body: "remote body",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        viewerCanUpdate: false,
        viewerCanDelete: false,
        htmlUrl: "https://",
      },
    ],
    anchor: { kind: "singleLine", line },
    mappingStatus: { kind: "mapped" },
  };
}

test("orders entries by file then start line", () => {
  const merged = mergeLocalAndRemote([local(1)], [remote("T1", 100, 1)]);
  expect(merged.map((e) => (e.kind === "remote" ? e.thread.threadId : `L${e.comment.id}`))).toEqual(
    ["T1", "L1"],
  );
});

test("drops local submitted comment when its githubId matches a remote one", () => {
  const merged = mergeLocalAndRemote([local(1, 100)], [remote("T1", 100, 4)]);
  expect(merged.length).toBe(1);
  expect(merged[0].kind).toBe("remote");
});

test("keeps local drafts even at the same anchor", () => {
  const merged = mergeLocalAndRemote([local(1, null)], [remote("T1", 100, 4)]);
  expect(merged.length).toBe(2);
});
```

- [ ] **Step 2: Run — expect failure**

Run: `bun test src/features/sync/lib/mergeLocalAndRemote.test.ts`
Expected: module not found.

- [ ] **Step 3: Implement**

Create `src/features/sync/lib/mergeLocalAndRemote.ts`:

```ts
import type { CommentAnchor, RemoteThread, ReviewComment } from "@/shared/ipc/contract";

export type MergedEntry =
  | { kind: "remote"; key: string; filePath: string; startLine: number; thread: RemoteThread }
  | { kind: "local"; key: string; filePath: string; startLine: number; comment: ReviewComment };

function anchorStart(anchor: CommentAnchor): number {
  return anchor.kind === "singleLine" ? anchor.line : anchor.startLine;
}

/**
 * Merges local comments and mapped remote threads into a stable ordered list.
 * Any local comment whose `githubId` matches a `RemoteComment.commentId` is
 * dropped — the remote thread carries the richer data (replies, viewerCan*,
 * resolved state), so showing both would be a confusing duplicate.
 *
 * Sort key: filePath, then anchor start line, then a stable tiebreaker
 * (`threadId` for remote, `id` for local).
 */
export function mergeLocalAndRemote(
  local: ReviewComment[],
  remote: RemoteThread[],
): MergedEntry[] {
  const remoteCommentIds = new Set<number>();
  for (const thread of remote) {
    for (const c of thread.comments) remoteCommentIds.add(c.commentId);
  }

  const entries: MergedEntry[] = [];

  for (const thread of remote) {
    if (!thread.anchor) continue; // unmapped goes elsewhere
    entries.push({
      kind: "remote",
      key: `remote:${thread.threadId}`,
      filePath: thread.path,
      startLine: anchorStart(thread.anchor),
      thread,
    });
  }

  for (const comment of local) {
    if (comment.githubId !== null && remoteCommentIds.has(comment.githubId)) continue;
    entries.push({
      kind: "local",
      key: `local:${comment.id}`,
      filePath: comment.filePath,
      startLine: anchorStart(comment.anchor),
      comment,
    });
  }

  entries.sort((a, b) => {
    if (a.filePath !== b.filePath) return a.filePath.localeCompare(b.filePath);
    if (a.startLine !== b.startLine) return a.startLine - b.startLine;
    return a.key.localeCompare(b.key);
  });

  return entries;
}
```

- [ ] **Step 4: Run the tests**

Run: `bun test src/features/sync/lib/mergeLocalAndRemote.test.ts`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/features/sync/lib/mergeLocalAndRemote.ts \
         src/features/sync/lib/mergeLocalAndRemote.test.ts
git commit -m "$(cat <<'EOF'
feat(phase-6): mergeLocalAndRemote helper

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: i18n keys

**Files:**
- Modify: `src/shared/i18n/locales/en.json`

- [ ] **Step 1: Add a `sync` namespace**

Append to `en.json` (top-level object key, between `comments` and `errors`):

```json
  "sync": {
    "section": {
      "remoteHeading": "GitHub threads",
      "unmappedHeading": "Unmapped threads",
      "unmappedSubtitle": "These remote threads couldn't be anchored to a line in the current head.",
      "truncatedWarning": "Showing the first 100 review threads. Older threads will sync once pagination is implemented.",
      "emptyMapped": "No remote review threads on this pull request yet.",
      "openOnGithub": "Open on GitHub"
    },
    "actions": {
      "reply": "Reply",
      "edit": "Edit",
      "delete": "Delete",
      "resolve": "Mark as resolved",
      "reopen": "Reopen thread",
      "cancel": "Cancel",
      "save": "Save",
      "send": "Send reply",
      "deleteConfirm": "Delete this comment? This cannot be undone."
    },
    "thread": {
      "replyPlaceholder": "Write a reply…",
      "editPlaceholder": "Edit your comment…",
      "byAuthor": "by {{author}}",
      "edited": "edited",
      "resolvedBadge": "Resolved",
      "openBadge": "Open",
      "outdatedBadge": "Outdated",
      "readOnlyTooltip": "You can only edit or delete your own comments."
    },
    "unmapped": {
      "fileMissing": "File no longer in this PR head ({{path}})",
      "lineMoved": "Original snippet no longer found at {{path}}:{{line}}",
      "ambiguous": "Snippet matches multiple positions in {{path}}",
      "outdated": "GitHub marked this thread as outdated"
    },
    "errors": {
      "refreshFailedTitle": "Couldn't refresh remote threads",
      "refreshFailedDescription": "We kept the cached threads. Try refreshing again.",
      "mutationFailedTitle": "Action failed",
      "readOnlyTitle": "Read-only on GitHub",
      "readOnlyDescription": "GitHub didn't allow this action — you may need write access on the repository."
    }
  },
```

- [ ] **Step 2: Validate JSON shape**

Run: `bun run typecheck`
Expected: clean (the `types.d.ts` regenerator is part of typecheck).

- [ ] **Step 3: Commit**

```bash
git add src/shared/i18n/locales/en.json
git commit -m "$(cat <<'EOF'
feat(phase-6): i18n keys for sync UI

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: React Query hooks for sync

**Files:**
- Create: `src/features/sync/hooks/useRemoteThreads.ts`
- Create: `src/features/sync/hooks/useReplyRemoteThread.ts`
- Create: `src/features/sync/hooks/useEditRemoteComment.ts`
- Create: `src/features/sync/hooks/useDeleteRemoteComment.ts`
- Create: `src/features/sync/hooks/useResolveRemoteThread.ts`
- Create: `src/features/sync/hooks/useReopenRemoteThread.ts`

- [ ] **Step 1: Implement `useRemoteThreads`**

```ts
// src/features/sync/hooks/useRemoteThreads.ts
import { ipc } from "@/shared/ipc/client";
import type { RefreshResult } from "@/shared/ipc/contract";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface Options {
  repoPath?: string;
  prNumber?: number;
  headSha?: string;
}

export function remoteThreadsKey(repoPath: string, prNumber: number) {
  return ["remote-threads", repoPath, prNumber] as const;
}

/**
 * Loads remote review threads for `(repoPath, prNumber)`. On mount we read
 * the SQLite cache; the user must click Refresh to hit GitHub. Both the
 * initial cache read and the manual refresh return the same `RefreshResult`
 * shape so the consumer doesn't care which path produced it.
 */
export function useRemoteThreads({ repoPath, prNumber, headSha }: Options) {
  const qc = useQueryClient();
  const enabled = Boolean(repoPath && prNumber !== undefined);
  const query = useQuery<RefreshResult | null>({
    queryKey: enabled ? remoteThreadsKey(repoPath!, prNumber!) : ["remote-threads", "disabled"],
    enabled,
    staleTime: Infinity, // never auto-refetch — refresh is explicit
    queryFn: async () => {
      const result = await ipc.sync.getCached(repoPath!, prNumber!);
      if (!result.ok) throw result.error;
      return result.value;
    },
  });

  const refresh = async (): Promise<RefreshResult | null> => {
    if (!repoPath || prNumber === undefined || !headSha) return null;
    const result = await ipc.sync.refresh(repoPath, prNumber, headSha);
    if (!result.ok) throw result.error;
    qc.setQueryData(remoteThreadsKey(repoPath, prNumber), result.value);
    return result.value;
  };

  return { ...query, refresh };
}
```

- [ ] **Step 2: Implement the five mutation hooks**

Each follows the same template. Example for reply (other four follow the same shape, swapping the `ipc.sync.*` call and the cache patcher):

```ts
// src/features/sync/hooks/useReplyRemoteThread.ts
import { ipc } from "@/shared/ipc/client";
import type { RefreshResult, RemoteComment, RemoteThread } from "@/shared/ipc/contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { remoteThreadsKey } from "./useRemoteThreads";

interface Vars {
  repoPath: string;
  prNumber: number;
  threadId: string;
  inReplyToCommentId: number;
  body: string;
}

export function useReplyRemoteThread() {
  const qc = useQueryClient();
  return useMutation<RemoteComment, Error, Vars>({
    mutationFn: async ({ repoPath, prNumber, inReplyToCommentId, body }) => {
      const result = await ipc.sync.reply(repoPath, prNumber, inReplyToCommentId, body);
      if (!result.ok) throw result.error;
      return result.value;
    },
    onSuccess: (added, { repoPath, prNumber, threadId }) => {
      qc.setQueryData<RefreshResult | null>(
        remoteThreadsKey(repoPath, prNumber),
        (prev) => prev && patchThread(prev, threadId, (t) => ({ ...t, comments: [...t.comments, added] })),
      );
    },
  });
}

function patchThread(
  prev: RefreshResult,
  threadId: string,
  patch: (t: RemoteThread) => RemoteThread,
): RefreshResult {
  return {
    ...prev,
    threads: prev.threads.map((t) => (t.threadId === threadId ? patch(t) : t)),
  };
}
```

Create:

```ts
// src/features/sync/hooks/useEditRemoteComment.ts
import { ipc } from "@/shared/ipc/client";
import type { RefreshResult, RemoteComment } from "@/shared/ipc/contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { remoteThreadsKey } from "./useRemoteThreads";

interface Vars {
  repoPath: string;
  prNumber: number;
  threadId: string;
  commentId: number;
  body: string;
}

export function useEditRemoteComment() {
  const qc = useQueryClient();
  return useMutation<RemoteComment, Error, Vars>({
    mutationFn: async ({ repoPath, commentId, body }) => {
      const result = await ipc.sync.edit(repoPath, commentId, body);
      if (!result.ok) throw result.error;
      return result.value;
    },
    onSuccess: (updated, { repoPath, prNumber, threadId, commentId }) => {
      qc.setQueryData<RefreshResult | null>(remoteThreadsKey(repoPath, prNumber), (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          threads: prev.threads.map((t) =>
            t.threadId === threadId
              ? {
                  ...t,
                  comments: t.comments.map((c) => (c.commentId === commentId ? updated : c)),
                }
              : t,
          ),
        };
      });
    },
  });
}
```

```ts
// src/features/sync/hooks/useDeleteRemoteComment.ts
import { ipc } from "@/shared/ipc/client";
import type { RefreshResult } from "@/shared/ipc/contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { remoteThreadsKey } from "./useRemoteThreads";

interface Vars {
  repoPath: string;
  prNumber: number;
  threadId: string;
  commentId: number;
}

export function useDeleteRemoteComment() {
  const qc = useQueryClient();
  return useMutation<void, Error, Vars>({
    mutationFn: async ({ repoPath, commentId }) => {
      const result = await ipc.sync.delete(repoPath, commentId);
      if (!result.ok) throw result.error;
    },
    onSuccess: (_void, { repoPath, prNumber, threadId, commentId }) => {
      qc.setQueryData<RefreshResult | null>(remoteThreadsKey(repoPath, prNumber), (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          threads: prev.threads
            .map((t) =>
              t.threadId === threadId
                ? { ...t, comments: t.comments.filter((c) => c.commentId !== commentId) }
                : t,
            )
            // Drop the thread when its last comment is gone — matches what
            // GitHub does on the web.
            .filter((t) => t.comments.length > 0),
        };
      });
    },
  });
}
```

```ts
// src/features/sync/hooks/useResolveRemoteThread.ts
import { ipc } from "@/shared/ipc/client";
import type { RefreshResult, RemoteThread } from "@/shared/ipc/contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { remoteThreadsKey } from "./useRemoteThreads";

interface Vars { repoPath: string; prNumber: number; threadId: string }

export function useResolveRemoteThread() {
  const qc = useQueryClient();
  return useMutation<RemoteThread, Error, Vars>({
    mutationFn: async ({ repoPath, threadId }) => {
      const result = await ipc.sync.resolve(repoPath, threadId);
      if (!result.ok) throw result.error;
      return result.value;
    },
    onSuccess: (updated, { repoPath, prNumber }) => {
      qc.setQueryData<RefreshResult | null>(remoteThreadsKey(repoPath, prNumber), (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          threads: prev.threads.map((t) => (t.threadId === updated.threadId ? updated : t)),
        };
      });
    },
  });
}
```

```ts
// src/features/sync/hooks/useReopenRemoteThread.ts — identical body except for `ipc.sync.reopen`.
import { ipc } from "@/shared/ipc/client";
import type { RefreshResult, RemoteThread } from "@/shared/ipc/contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { remoteThreadsKey } from "./useRemoteThreads";

interface Vars { repoPath: string; prNumber: number; threadId: string }

export function useReopenRemoteThread() {
  const qc = useQueryClient();
  return useMutation<RemoteThread, Error, Vars>({
    mutationFn: async ({ repoPath, threadId }) => {
      const result = await ipc.sync.reopen(repoPath, threadId);
      if (!result.ok) throw result.error;
      return result.value;
    },
    onSuccess: (updated, { repoPath, prNumber }) => {
      qc.setQueryData<RefreshResult | null>(remoteThreadsKey(repoPath, prNumber), (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          threads: prev.threads.map((t) => (t.threadId === updated.threadId ? updated : t)),
        };
      });
    },
  });
}
```

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/features/sync/hooks
git commit -m "$(cat <<'EOF'
feat(phase-6): React Query hooks for remote threads

useRemoteThreads loads from cache + refresh; five mutation hooks
optimistically patch the cached payload.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# Phase 5 — Frontend UI

## Task 15: `RemoteCommentBody` + `RemoteReplyComposer` + `RemoteThreadCard`

**Files:**
- Create: `src/features/sync/components/RemoteCommentBody.tsx`
- Create: `src/features/sync/components/RemoteReplyComposer.tsx`
- Create: `src/features/sync/components/RemoteThreadCard.tsx`

- [ ] **Step 1: `RemoteCommentBody`**

```tsx
// src/features/sync/components/RemoteCommentBody.tsx
import type { RemoteComment } from "@/shared/ipc/contract";
import { Button } from "@/shared/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import { PencilIcon, TrashIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Props {
  comment: RemoteComment;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function RemoteCommentBody({ comment, onEdit, onDelete }: Props) {
  const { t } = useTranslation();
  return (
    <article className="flex flex-col gap-1.5 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3">
      <header className="flex items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-2 font-medium text-[hsl(var(--foreground))]">
          {comment.authorAvatarUrl ? (
            <img
              src={comment.authorAvatarUrl}
              alt=""
              className="size-5 rounded-full"
              loading="lazy"
            />
          ) : null}
          {t("sync.thread.byAuthor", { author: comment.author })}
        </span>
        {comment.viewerCanUpdate || comment.viewerCanDelete ? (
          <div className="flex items-center gap-1">
            {comment.viewerCanUpdate ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={onEdit}
                    aria-label={t("sync.actions.edit")}
                  >
                    <PencilIcon className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("sync.actions.edit")}</TooltipContent>
              </Tooltip>
            ) : null}
            {comment.viewerCanDelete ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={onDelete}
                    aria-label={t("sync.actions.delete")}
                  >
                    <TrashIcon className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("sync.actions.delete")}</TooltipContent>
              </Tooltip>
            ) : null}
          </div>
        ) : null}
      </header>
      <p className="whitespace-pre-wrap text-sm text-[hsl(var(--foreground))]">{comment.body}</p>
    </article>
  );
}
```

- [ ] **Step 2: `RemoteReplyComposer`**

```tsx
// src/features/sync/components/RemoteReplyComposer.tsx
import { Button } from "@/shared/ui/button";
import { Textarea } from "@/shared/ui/textarea";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface Props {
  pending: boolean;
  onSubmit: (body: string) => void;
}

export function RemoteReplyComposer({ pending, onSubmit }: Props) {
  const { t } = useTranslation();
  const [body, setBody] = useState("");
  const submit = () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setBody("");
  };
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t("sync.thread.replyPlaceholder")}
        rows={2}
        disabled={pending}
      />
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={pending || body.trim().length === 0}>
          {t("sync.actions.send")}
        </Button>
      </div>
    </form>
  );
}
```

If `Textarea` doesn't exist yet under `src/shared/ui/`, install via `bunx --bun shadcn@latest add textarea` (the project already uses this pattern — see ARCHITECTURE.md). Run `bun run check:fix` afterwards.

- [ ] **Step 3: `RemoteThreadCard`**

```tsx
// src/features/sync/components/RemoteThreadCard.tsx
import type { RemoteThread } from "@/shared/ipc/contract";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useDeleteRemoteComment } from "../hooks/useDeleteRemoteComment";
import { useEditRemoteComment } from "../hooks/useEditRemoteComment";
import { useReopenRemoteThread } from "../hooks/useReopenRemoteThread";
import { useReplyRemoteThread } from "../hooks/useReplyRemoteThread";
import { useResolveRemoteThread } from "../hooks/useResolveRemoteThread";
import { RemoteCommentBody } from "./RemoteCommentBody";
import { RemoteReplyComposer } from "./RemoteReplyComposer";

interface Props {
  thread: RemoteThread;
  repoPath: string;
  prNumber: number;
}

export function RemoteThreadCard({ thread, repoPath, prNumber }: Props) {
  const { t } = useTranslation();
  const reply = useReplyRemoteThread();
  const edit = useEditRemoteComment();
  const del = useDeleteRemoteComment();
  const resolve = useResolveRemoteThread();
  const reopen = useReopenRemoteThread();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingBody, setEditingBody] = useState("");

  const first = thread.comments[0];
  const lastReplyTarget = thread.comments.at(-1)?.commentId ?? first?.commentId;

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-3">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge tone={thread.state === "resolved" ? "success" : "default"}>
            {thread.state === "resolved"
              ? t("sync.thread.resolvedBadge")
              : t("sync.thread.openBadge")}
          </Badge>
          {thread.isOutdated ? (
            <Badge tone="warning">{t("sync.thread.outdatedBadge")}</Badge>
          ) : null}
        </div>
        {thread.state === "open" && thread.viewerCanResolve ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              resolve.mutate({ repoPath, prNumber, threadId: thread.threadId })
            }
            disabled={resolve.isPending}
          >
            {t("sync.actions.resolve")}
          </Button>
        ) : null}
        {thread.state === "resolved" && thread.viewerCanUnresolve ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => reopen.mutate({ repoPath, prNumber, threadId: thread.threadId })}
            disabled={reopen.isPending}
          >
            {t("sync.actions.reopen")}
          </Button>
        ) : null}
      </header>

      <ol className="flex flex-col gap-2">
        {thread.comments.map((c) => (
          <li key={c.commentId}>
            {editingId === c.commentId ? (
              <form
                className="flex flex-col gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const trimmed = editingBody.trim();
                  if (!trimmed) return;
                  edit.mutate(
                    {
                      repoPath,
                      prNumber,
                      threadId: thread.threadId,
                      commentId: c.commentId,
                      body: trimmed,
                    },
                    { onSuccess: () => setEditingId(null) },
                  );
                }}
              >
                <textarea
                  className="min-h-20 rounded border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-2 text-sm"
                  value={editingBody}
                  onChange={(e) => setEditingBody(e.target.value)}
                />
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingId(null)}
                  >
                    {t("sync.actions.cancel")}
                  </Button>
                  <Button type="submit" size="sm" disabled={edit.isPending}>
                    {t("sync.actions.save")}
                  </Button>
                </div>
              </form>
            ) : (
              <RemoteCommentBody
                comment={c}
                onEdit={() => {
                  setEditingId(c.commentId);
                  setEditingBody(c.body);
                }}
                onDelete={() => {
                  if (window.confirm(t("sync.actions.deleteConfirm"))) {
                    del.mutate({
                      repoPath,
                      prNumber,
                      threadId: thread.threadId,
                      commentId: c.commentId,
                    });
                  }
                }}
              />
            )}
          </li>
        ))}
      </ol>

      {thread.state === "open" && lastReplyTarget !== undefined ? (
        <RemoteReplyComposer
          pending={reply.isPending}
          onSubmit={(body) =>
            reply.mutate({
              repoPath,
              prNumber,
              threadId: thread.threadId,
              inReplyToCommentId: lastReplyTarget,
              body,
            })
          }
        />
      ) : null}
    </section>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `bun run typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/features/sync/components/RemoteCommentBody.tsx \
         src/features/sync/components/RemoteReplyComposer.tsx \
         src/features/sync/components/RemoteThreadCard.tsx
# If you installed a new shadcn primitive, include it:
git add src/shared/ui/textarea.tsx components.json 2>/dev/null
git commit -m "$(cat <<'EOF'
feat(phase-6 #32): RemoteThreadCard with reply/edit/delete/resolve actions

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: `UnmappedThreadsSection` (#34) + `unmappedReason` helper

**Files:**
- Create: `src/features/sync/lib/unmappedReason.ts`
- Create: `src/features/sync/components/UnmappedThreadsSection.tsx`

- [ ] **Step 1: Reason resolver**

```ts
// src/features/sync/lib/unmappedReason.ts
import type { RemoteThread } from "@/shared/ipc/contract";
import type { TFunction } from "i18next";

export function describeUnmappedReason(thread: RemoteThread, t: TFunction): string {
  const status = thread.mappingStatus;
  switch (status.kind) {
    case "fileMissing":
      return t("sync.unmapped.fileMissing", { path: thread.path });
    case "lineMoved":
      return t("sync.unmapped.lineMoved", {
        path: thread.path,
        line: thread.originalLine,
      });
    case "ambiguous":
      return t("sync.unmapped.ambiguous", { path: thread.path });
    case "outdated":
      return t("sync.unmapped.outdated");
    case "mapped":
      // Defensive: an unmapped thread should never report Mapped, but
      // returning a sensible message keeps the UI from crashing on stale
      // payloads.
      return t("sync.unmapped.outdated");
  }
}
```

- [ ] **Step 2: Section component**

```tsx
// src/features/sync/components/UnmappedThreadsSection.tsx
import type { RemoteThread } from "@/shared/ipc/contract";
import { Button } from "@/shared/ui/button";
import { ChevronDownIcon, ChevronRightIcon, ExternalLinkIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { describeUnmappedReason } from "../lib/unmappedReason";

interface Props {
  threads: RemoteThread[];
}

export function UnmappedThreadsSection({ threads }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (threads.length === 0) return null;
  const Chevron = open ? ChevronDownIcon : ChevronRightIcon;
  return (
    <section className="border-t border-[hsl(var(--border))] px-4 py-3">
      <button
        type="button"
        className="flex w-full items-center gap-2 text-left text-xs font-semibold text-[hsl(var(--foreground))]"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <Chevron className="size-3.5" />
        {t("sync.section.unmappedHeading")} ({threads.length})
      </button>
      {open ? (
        <div className="mt-2 flex flex-col gap-2">
          <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
            {t("sync.section.unmappedSubtitle")}
          </p>
          <ul className="flex flex-col gap-2">
            {threads.map((thread) => {
              const firstComment = thread.comments[0];
              return (
                <li
                  key={thread.threadId}
                  className="flex flex-col gap-1 rounded-md border border-dashed border-[hsl(var(--border))] p-2"
                >
                  <span className="text-xs font-medium text-[hsl(var(--foreground))]">
                    {describeUnmappedReason(thread, t)}
                  </span>
                  {firstComment ? (
                    <span className="line-clamp-2 text-[11px] text-[hsl(var(--muted-foreground))]">
                      {t("sync.thread.byAuthor", { author: firstComment.author })}: {firstComment.body}
                    </span>
                  ) : null}
                  {firstComment ? (
                    <Button
                      asChild
                      variant="ghost"
                      size="sm"
                      className="h-7 w-fit gap-1 px-2 text-[11px]"
                    >
                      <a href={firstComment.htmlUrl} target="_blank" rel="noreferrer">
                        <ExternalLinkIcon className="size-3" />
                        {t("sync.section.openOnGithub")}
                      </a>
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 3: Typecheck + lint**

Run: `bun run typecheck && bun run check`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/features/sync/lib/unmappedReason.ts \
         src/features/sync/components/UnmappedThreadsSection.tsx
git commit -m "$(cat <<'EOF'
feat(phase-6 #34): UnmappedThreadsSection + reason resolver

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 17: Export sync feature + extend RefreshButton

**Files:**
- Modify: `src/features/sync/index.ts`
- Modify: `src/features/main/components/RefreshButton.tsx`

- [ ] **Step 1: Replace the placeholder export**

```ts
// src/features/sync/index.ts
export { RemoteThreadCard } from "./components/RemoteThreadCard";
export { UnmappedThreadsSection } from "./components/UnmappedThreadsSection";
export { useRemoteThreads, remoteThreadsKey } from "./hooks/useRemoteThreads";
export { useReplyRemoteThread } from "./hooks/useReplyRemoteThread";
export { useEditRemoteComment } from "./hooks/useEditRemoteComment";
export { useDeleteRemoteComment } from "./hooks/useDeleteRemoteComment";
export { useResolveRemoteThread } from "./hooks/useResolveRemoteThread";
export { useReopenRemoteThread } from "./hooks/useReopenRemoteThread";
export { mergeLocalAndRemote } from "./lib/mergeLocalAndRemote";
export type { MergedEntry } from "./lib/mergeLocalAndRemote";
```

- [ ] **Step 2: Extend `RefreshButton` defaults**

Edit `src/features/main/components/RefreshButton.tsx` — extend `DEFAULT_KEYS`:

```ts
const DEFAULT_KEYS = [
  "pull-requests",
  "pull-request",
  "changed-files",
  "file-content",
  "file-diff",
  "remote-threads",
];
```

But invalidating the cache won't actually trigger a network fetch (the hook's `queryFn` only reads the SQLite cache). The "remote refresh from GitHub" semantic lives on a separate path: the consumer that mounts `useRemoteThreads` is responsible for calling `.refresh()` from a refresh action. To wire that up, we need `RefreshButton` to take an optional `onRefresh` callback the consumer can supply. Add:

```ts
interface RefreshButtonProps {
  keys?: string[];
  /**
   * Optional async hook the consumer fires alongside the React Query
   * invalidation — used by ThreadsPane to also call `useRemoteThreads.refresh`
   * so the user sees the GitHub round-trip when they click Refresh.
   */
  onRefresh?: () => Promise<unknown>;
}
```

And inside `handleClick`:

```ts
    try {
      await Promise.all([
        ...keys.map((k) => qc.invalidateQueries({ queryKey: [k] })),
        onRefresh?.(),
      ]);
    } finally { … }
```

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/features/sync/index.ts src/features/main/components/RefreshButton.tsx
git commit -m "$(cat <<'EOF'
feat(phase-6): wire RefreshButton to trigger remote-thread refresh

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 18: ThreadsPane integration

**Files:**
- Modify: `src/features/main/components/ThreadsPane.tsx`

- [ ] **Step 1: Wire `useRemoteThreads` + merged list + unmapped section**

The existing `ThreadsPane` renders a list of local-only threads. We replace that list with a merged stream — keep the local-only `ThreadList` rendering for `local`-kind entries (so existing keyboard navigation and grouping continues to work) and render the new `RemoteThreadCard` for `remote`-kind entries. The unmapped section is appended after the main list.

Edit `ThreadsPane.tsx`:

1. Add imports near the top:

```tsx
import {
  RemoteThreadCard,
  UnmappedThreadsSection,
  mergeLocalAndRemote,
  useRemoteThreads,
} from "@/features/sync";
```

2. Inside the component, call the new hook (props already include `repoPath`, `prNumber`, `sha`):

```tsx
  const remote = useRemoteThreads({ repoPath, prNumber, headSha: sha });
  const remoteData = remote.data;
```

3. Replace the existing `scopedComments`/`visible`/`hiddenCount` plumbing's *render* (not the local filter logic — keep that as is for local threads) with a merged stream when in `allFiles` scope, or filtered by the active file when scoped to the current file. Concretely, compute:

```tsx
  const remoteThreads = useMemo(() => {
    if (!remoteData) return [];
    if (effectiveScope === "currentFile" && filePath) {
      return remoteData.threads.filter((t) => t.path === filePath);
    }
    return remoteData.threads;
  }, [remoteData, effectiveScope, filePath]);

  const merged = useMemo(
    () => mergeLocalAndRemote(visible, remoteThreads),
    [visible, remoteThreads],
  );

  const unmapped = useMemo(() => {
    if (!remoteData) return [];
    if (effectiveScope === "currentFile" && filePath) {
      return remoteData.unmapped.filter((t) => t.path === filePath);
    }
    return remoteData.unmapped;
  }, [remoteData, effectiveScope, filePath]);
```

4. Where the JSX renders the existing thread list, branch on entry kind. The simplest path: render the existing `<ThreadList>` only with `local`-kind entries' comments (extract them with `merged.filter(e => e.kind === "local").map(e => e.comment)`), and render `RemoteThreadCard` for each `remote` entry above the list. If your `ThreadList` already does grouping, keep it — but interleaving requires turning the JSX into a flat `merged.map(entry => entry.kind === "remote" ? <RemoteThreadCard …/> : <LocalThreadRow …/>)`. Use the option that produces correct ordering with minimal churn — pick whichever fits the existing keyboard navigation patterns (see the existing `ThreadList.tsx` roving-tabindex implementation).

5. After the main list, render `<UnmappedThreadsSection threads={unmapped} />`.

6. If `prNumber` and `repoPath` are present, pass `remote.refresh` to a `RefreshButton onRefresh={remote.refresh}` instance — likely in the parent `MainLayout`. If `RefreshButton` lives outside `ThreadsPane`, surface a callback prop and let the parent pass it down.

7. Show a banner when `remote.error` is set:

```tsx
  {remote.error ? (
    <Alert variant="destructive" className="mx-4 my-2">
      <AlertTitle>{t("sync.errors.refreshFailedTitle")}</AlertTitle>
      <AlertDescription>{t("sync.errors.refreshFailedDescription")}</AlertDescription>
    </Alert>
  ) : null}
```

- [ ] **Step 2: Typecheck + lint**

Run: `bun run typecheck && bun run check`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/features/main/components/ThreadsPane.tsx
git commit -m "$(cat <<'EOF'
feat(phase-6 #31 #32 #34): integrate remote threads into ThreadsPane

Renders remote threads inline with local ones, with an Unmapped
section at the bottom and a refresh-failure banner.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 19: Hook MainLayout's RefreshButton to remote refresh

**Files:**
- Modify: `src/features/main/screens/MainLayout.tsx` (or wherever `RefreshButton` is rendered alongside the `ThreadsPane`)

- [ ] **Step 1: Locate the RefreshButton mount and wire `onRefresh`**

Run: `grep -rn "<RefreshButton" src/features`
Expected: 1–2 hits. For each occurrence inside `MainLayout` (or equivalent), call `useRemoteThreads(...)` in the same component and pass `onRefresh={remote.refresh}` to `<RefreshButton>`.

If `useRemoteThreads` is already mounted inside `ThreadsPane`, lift it into `MainLayout` (single source of truth) and pass `remote.data` down via prop or via a small context. Choose lifting — duplicate hook instances with the same query key would still share React Query cache, but lifting keeps the code obvious.

- [ ] **Step 2: Build the frontend and run the app to smoke-test**

Run: `bun run dev` (Tauri will spawn Vite). Open a repo with a known PR that already has review threads. Click Refresh. Threads should appear; clicking reply / edit / resolve should round-trip.

If the dev server can't reach `gh` (`gh auth status` fails), the existing `GhNotAuthenticated` error already surfaces — confirm the new sync flows reuse the same error mapping (no extra UI work needed).

- [ ] **Step 3: Commit any wiring fixes**

```bash
git add src/features/main/screens/MainLayout.tsx
git commit -m "$(cat <<'EOF'
feat(phase-6): wire RefreshButton onRefresh to useRemoteThreads.refresh

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# Phase 6 — Verification

## Task 20: Full verification + fixups

**Files:**
- Any files needed to clear lint / type / test failures.

- [ ] **Step 1: Format**

Run: `cargo fmt --all` then `bun run check:fix`.

- [ ] **Step 2: Rust lint**

Run: `cargo clippy --workspace --all-targets -- -D warnings`
Expected: clean. Fix inline.

- [ ] **Step 3: Rust tests**

Run: `cargo test --workspace`
Expected: green.

- [ ] **Step 4: TS type + lint + build**

Run: `bun run typecheck && bun run check && bun run build:web`
Expected: green.

- [ ] **Step 5: Bun unit tests**

Run: `bun test`
Expected: green.

- [ ] **Step 6: Manual smoke (spec checklist)**

Open the dev app via `bun run dev` and walk through the manual checklist in `docs/superpowers/specs/2026-05-24-phase-6-github-sync-design.md` ("Verification checklist (manual)"). Mark each item off in this plan as you go:

  - [ ] PR with open / resolved / outdated threads → refresh → correct buckets.
  - [ ] Single-line and multi-line anchors render correctly.
  - [ ] Force an unmapped thread (rename a file locally) → appears under "Unmapped".
  - [ ] Reply persists after refresh.
  - [ ] Edit own comment in place; edit button hidden on others'.
  - [ ] Delete own comment.
  - [ ] Resolve / reopen toggles badge.
  - [ ] Restart app → cache hydrates before refresh click.
  - [ ] Switch PR and back → cache still there.
  - [ ] No raw English in the new UI (everything reads via `t(...)`).

- [ ] **Step 7: Commit fixups**

If any of the above produced fixes, commit them:

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore(phase-6): verification fixes

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 8: Open the PR**

Run:

```bash
git push -u origin feat/phase-6-github-sync
gh pr create --title "feat(phase-6): GitHub sync — refresh, mutations, cache, unmapped" --body "$(cat <<'EOF'
## Summary
- Refresh remote review threads via GraphQL and anchor them to the current head (#31).
- Reply / edit / delete / resolve / reopen remote threads where GitHub allows; read-only otherwise (#32).
- Per-PR SQLite cache with explicit invalidation; cache hydrates at boot (#33).
- Surface unmappable threads under a dedicated "Unmapped" section in the threads pane (#34).

Spec: `docs/superpowers/specs/2026-05-24-phase-6-github-sync-design.md`
Plan: `docs/superpowers/plans/2026-05-24-phase-6-github-sync.md`

## Test plan
- [ ] `cargo test --workspace`
- [ ] `bun run typecheck && bun run check && bun run build:web`
- [ ] `bun test`
- [ ] Manual smoke (verification checklist in the spec)

Closes #31, #32, #33, #34.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review

(Performed at plan-write time; documented for the executor.)

- Every Phase 6 issue has at least one task: #31 → Tasks 5/6/8/10; #32 → Tasks 9/10/14/15/17/18; #33 → Tasks 4/7/10/11/14; #34 → Tasks 5/6/16/18.
- No `TBD` or `add appropriate error handling` placeholders — each task carries the exact code or a precise pointer to an existing pattern (with the file path) when the snippet would be too long to inline.
- Type/method names stay consistent: `RemoteThread`, `RemoteComment`, `RefreshResult`, `MappingStatus`, `Sync`, `RemoteThreadsStore`, `FileResolver`, `mergeLocalAndRemote`, `remoteThreadsKey` are introduced once and referenced under the same names everywhere.
- Commits are granular (one per task) and ride on the `feat/phase-6-github-sync` branch already created with the spec commit.

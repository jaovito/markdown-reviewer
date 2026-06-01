# Phase 6 — GitHub Sync (Design)

**Status:** Draft · **Date:** 2026-05-24 · **Branch:** `feat/phase-6-github-sync` · **Milestone:** [Phase 6 — GitHub Sync](https://github.com/jaovito/markdown-reviewer/milestone/6)

Implements the four Phase 6 issues:

- [#31](https://github.com/jaovito/markdown-reviewer/issues/31) — `refresh_remote_comments` + anchor mapping
- [#32](https://github.com/jaovito/markdown-reviewer/issues/32) — Reply / edit / delete / resolve / reopen remote threads
- [#33](https://github.com/jaovito/markdown-reviewer/issues/33) — Per-PR cache with explicit invalidation
- [#34](https://github.com/jaovito/markdown-reviewer/issues/34) — Report unmappable remote threads

All four ship on a single branch with one PR. The product principles from `CLAUDE.md` apply: local-first, explicit refresh, no polling, `gh` preferred over raw REST, no secrets in logs.

---

## Goals

1. The user can pull existing review threads from GitHub into the app with a single click and see them anchored to their Markdown lines next to local drafts.
2. The user can reply to, edit, delete, and resolve/reopen review threads from inside the app, with read-only state shown clearly when the GitHub API denies the action.
3. The threads pane visually distinguishes local drafts, locally-submitted comments, and remote threads, and surfaces threads we couldn't safely anchor under a dedicated "Unmapped" section.
4. Remote data persists per (repo, PR) so the app boots into the last known good state without re-hitting GitHub. Cache is invalidated on PR switch, branch switch, or explicit refresh — never on a timer.

## Non-goals

- Real-time sync, websockets, or polling.
- Pull-request review *event* state ("Approve", "Request changes"). Phase 6 only covers comment threads; we already submit reviews as `COMMENT` event in Phase 3.
- Conflict resolution when the same comment is edited locally and remotely between refreshes — we always treat the remote payload as the source of truth on refresh.
- Cross-PR navigation from an unmapped thread.

---

## Architecture

### Layer summary

```
core/
  domain/remote_thread.rs        (new) RemoteThread, RemoteComment, ThreadState, MappingStatus, UnmappedThread
  ports/gh.rs                    (extend) list_review_threads, reply/edit/delete review-comment, resolve/unresolve thread
  ports/remote_threads_store.rs  (new) cache trait
  application/sync/              (new) refresh.rs, mutations.rs, mapping.rs
  error.rs                       (extend) ReadOnlyRemote variant if needed
infra/
  gh/gh_cli.rs                   (extend) implement new GhClient methods (REST + GraphQL)
  sqlite/
    migrations/0004_remote_threads_cache.sql  (new)
    remote_threads_store.rs                   (new)
ipc/
  commands/sync.rs               (new) 7 new commands
  state.rs                       (extend) Sync use-case bundle
src-tauri/
  bootstrap.rs                   (extend) wire SqliteRemoteThreadsStore into AppState

src/
  features/sync/                 (extend the placeholder)
    hooks/                       useRemoteThreads, useReply*, useEdit*, useDelete*, useResolve*, useReopen*
    components/                  RemoteThreadCard, RemoteReplyComposer, UnmappedThreadsSection
    lib/                         mergeLocalAndRemote.ts (ordering rules)
    index.ts
  features/main/components/
    ThreadsPane.tsx              (extend) consume remote threads + unmapped
    RefreshButton.tsx            (extend) invalidate ["remote-threads"]
  shared/ipc/contract.ts         (extend) new types + commands
  shared/i18n/locales/en.json    (extend) sync.* namespace
```

Rule of thumb stays the same: `core` knows nothing about HTTP/SQLite; `infra` implements ports; `ipc` is a 5-line adapter per command.

### Domain types

```rust
// core/domain/remote_thread.rs

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteThread {
    /// GraphQL node id of the PullRequestReviewThread. Used for resolve/unresolve mutations.
    pub thread_id: String,
    /// PR-level path the thread is anchored to, as GitHub reports it.
    pub path: String,
    /// Original commit SHA the thread was first posted against.
    pub original_commit_id: String,
    /// `null` when GitHub marks the thread as outdated (line moved past the diff).
    pub line: Option<u32>,
    pub start_line: Option<u32>,
    pub original_line: u32,
    pub original_start_line: Option<u32>,
    pub state: ThreadState,
    pub is_outdated: bool,
    pub viewer_can_resolve: bool,
    pub viewer_can_unresolve: bool,
    pub comments: Vec<RemoteComment>,
    /// Resolved during anchor mapping. `None` when unmappable.
    pub anchor: Option<CommentAnchor>,
    pub mapping_status: MappingStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteComment {
    /// REST review-comment id. Used for edit/delete (`/pulls/comments/{id}`).
    pub comment_id: i64,
    pub author: String,
    pub author_avatar_url: Option<String>,
    pub body: String,
    pub created_at: String, // RFC3339
    pub updated_at: String,
    pub viewer_can_update: bool,
    pub viewer_can_delete: bool,
    pub html_url: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ThreadState { Open, Resolved }

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum MappingStatus {
    Mapped,
    Outdated { reason: String },
    FileMissing,
    LineMoved,
    Ambiguous,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RefreshResult {
    pub threads: Vec<RemoteThread>, // Mapped threads only (anchor != None)
    pub unmapped: Vec<RemoteThread>, // mapping_status != Mapped, kept for #34 panel
    pub refreshed_at_ms: i64,
}
```

The `RemoteThread` always lives on the same surface whether mapped or not; the `RefreshResult` partitions for ergonomic frontend consumption. Cache stores the full set.

### Anchor mapping algorithm (#31)

Pure function `core::application::sync::mapping::map_anchor(thread, head_sha, file_resolver) -> (Option<CommentAnchor>, MappingStatus)`.

Algorithm:

1. **Outdated short-circuit.** If GitHub says `is_outdated` or `line == None`, return `(None, Outdated { reason: "github_outdated" })`. The thread is preserved as unmapped.
2. **Same commit.** If `original_commit_id == head_sha` and `line.is_some()`, build a `LineRange` (or `SingleLine` when `start_line == line`) and return `Mapped`.
3. **Different commit, same path.** If the file exists at `head_sha` and the snippet at `original_line..original_line+span` *as it appeared on `original_commit_id`* is found exactly once at a new position in `head_sha`, anchor to that position. Return `Mapped`.
4. **Not found / multiple matches.** Return `(None, LineMoved)` (single absence) or `(None, Ambiguous)` (multiple matches). Both go to the unmapped section.
5. **File missing.** Return `(None, FileMissing)`.

The snippet comparison uses byte-identity on the original lines fetched via `GhClient::get_file_content(original_commit_id, path)`. Rename detection is out of scope for v1 — a renamed file falls through as `FileMissing`. We accept this as a known limitation and add a follow-up issue.

`file_resolver` is a trait so the mapping function stays IO-free in unit tests:

```rust
#[async_trait]
pub trait FileResolver: Send + Sync {
    async fn read(&self, sha: &str, path: &str) -> AppResult<String>;
}
```

Production impl delegates to `GitClient::show` with a `GhClient::get_file_content` fallback (same pattern as Phase 5 file loading).

### Cache (#33)

```sql
-- migrations/0004_remote_threads_cache.sql
CREATE TABLE IF NOT EXISTS remote_threads_cache (
    repo_path TEXT NOT NULL,
    pr_number INTEGER NOT NULL,
    head_sha TEXT NOT NULL,
    refreshed_at_ms INTEGER NOT NULL,
    payload_json TEXT NOT NULL,
    PRIMARY KEY (repo_path, pr_number)
);
```

- One row per (repo, pr). `head_sha` is stored alongside `refreshed_at_ms` so the UI can warn when the cache predates the current head.
- `payload_json` holds the serialized `Vec<RemoteThread>` (including unmapped ones). We deliberately do not normalize threads into a relational schema — they are read-mostly, written atomically per refresh, and never queried by field.
- Invalidation:
  - `refresh_remote_comments` always hits the network and overwrites the row.
  - The frontend invalidates the React Query key `["remote-threads", repoPath, prNumber]` on PR change and refresh-button click (same as Phase 2 caches).
  - No timer, no polling.

### Mutations (#32)

`GhClient` gets six new methods (all via `gh api`, the project's standard for hitting GitHub):

| Method | Endpoint | Notes |
|---|---|---|
| `list_review_threads(repo, pr)` | GraphQL `repository.pullRequest.reviewThreads(first: 100)` | One round-trip brings threads + comments + `viewerCan*` + `isResolved` + `isOutdated`. Truncation past 100 threads is logged and surfaced via a banner; pagination is a follow-up. |
| `reply_review_comment(repo, pr, in_reply_to_rest_id, body)` | REST `POST /repos/{o}/{r}/pulls/{pr}/comments` with `in_reply_to` | REST endpoint; GraphQL has no reply mutation that takes only an id. |
| `edit_review_comment(repo, comment_rest_id, body)` | REST `PATCH /repos/{o}/{r}/pulls/comments/{id}` | |
| `delete_review_comment(repo, comment_rest_id)` | REST `DELETE /repos/{o}/{r}/pulls/comments/{id}` | 204 on success. |
| `resolve_review_thread(thread_node_id)` | GraphQL `resolveReviewThread` mutation | Thread node id, not comment id. |
| `unresolve_review_thread(thread_node_id)` | GraphQL `unresolveReviewThread` mutation | |

Error mapping:
- HTTP `403` / GraphQL `viewerCannotUpdate` → `AppError::Validation { message: "read-only on GitHub" }` — UI hides the action.
- HTTP `404` after we successfully fetched the thread → `AppError::Validation { message: "thread no longer exists upstream" }` — UI shows a banner and prompts a refresh.
- Network/process errors flow through the existing `AppError::Process` channel.

Mutations return the *updated* `RemoteComment` or `RemoteThread` whenever possible so the frontend can update React Query cache without a full refresh. Resolve/unresolve fetch the single thread back via GraphQL after mutation. Delete returns `null`.

### IPC contract

Seven new commands added to `crates/ipc/src/commands/sync.rs`:

```ts
// shared/ipc/contract.ts additions
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

`headSha` is passed into `refresh_remote_comments` so the backend can map without a separate query — the frontend already has it from `load_pull_request`.

### Frontend integration

**`src/features/sync/` (was placeholder).** Becomes a real feature:

- `hooks/useRemoteThreads.ts` — React Query that reads from `get_cached_remote_threads` on mount, then surfaces a `refresh()` that calls `refresh_remote_comments`. Query key: `["remote-threads", repoPath, prNumber]`.
- `hooks/useReplyRemoteThread.ts`, `useEditRemoteComment.ts`, `useDeleteRemoteComment.ts`, `useResolveRemoteThread.ts`, `useReopenRemoteThread.ts` — mutations that optimistically patch the cached payload.
- `components/RemoteThreadCard.tsx` — extends the existing `ThreadCard` props with `RemoteThread`-specific affordances (avatar, GitHub badge, action menu). Lives in sync to keep the comments feature free of remote-state concerns.
- `components/RemoteReplyComposer.tsx` — single-line composer scoped to a thread; reuses `CommentComposer` primitives where possible.
- `components/UnmappedThreadsSection.tsx` — collapsible section rendered at the bottom of `ThreadsPane` with each unmapped thread (author, path:line snippet, "Open on GitHub" link, mapping reason).
- `lib/mergeLocalAndRemote.ts` — merges `ReviewComment[]` and `RemoteThread[]` into a stable ordered list keyed by `(filePath, startLine)`. Dedupes: any local comment whose `githubId` matches a `RemoteComment.commentId` is dropped — the remote thread carries the richer data (replies, `viewerCan*`, resolved state).

**`features/main/components/ThreadsPane.tsx`** — extended to consume the merged stream and to render the unmapped section. The pane keeps its existing roving-tabindex tree.

**`RefreshButton`** — adds `"remote-threads"` to the default invalidation keys so the one refresh button covers Phase 6 too.

**No raw strings.** Every new label goes through `i18next` under the `sync.*` namespace (`sync.thread.replyPlaceholder`, `sync.actions.resolve`, `sync.unmapped.heading`, `sync.unmapped.reason.fileMissing`, etc.). Error mapping additions go through `errors.*`.

---

## Data flow

```
[user opens PR]
        │
        ▼
  hydrate cache  ──►  get_cached_remote_threads  ──►  threads pane shows last-known state
        │
        ▼
[user clicks refresh]
        │
        ▼
  refresh_remote_comments  ──►  GhCli.list_review_threads (GraphQL)
        │                              │
        │                              ▼
        │                       fetch each thread's anchor file at original_commit_id
        │                       (cached per (sha, path) inside the call)
        │                              │
        │                              ▼
        │                       map_anchor  ──►  (anchor?, mapping_status)
        │                              │
        │                              ▼
        │                       partition into mapped / unmapped
        │
        ▼
  write remote_threads_cache row  ──►  return RefreshResult
        │
        ▼
  React Query patches ["remote-threads", repo, pr]  ──►  pane re-renders

[user replies / edits / deletes / resolves / reopens]
        │
        ▼
  command → GhCli mutation → updated RemoteThread/RemoteComment → optimistic cache patch
```

---

## Error handling

| Scenario | Where | Behavior |
|---|---|---|
| `gh` missing / unauthenticated | All sync commands | Existing `MissingTool` / `GhNotAuthenticated` errors — UI already maps these. |
| Network failure during refresh | `refresh_remote_comments` | `AppError::Process`; UI keeps cached state and shows an inline "refresh failed" banner. |
| Anchor file missing at `original_commit_id` | mapping | Thread goes to unmapped with `FileMissing`. No error to the caller. |
| Mutation denied by viewer permissions | mutation commands | `AppError::Validation` mapped to UI tooltip ("Only the comment author can edit"). |
| Mutation succeeds but refetch fails | resolve/unresolve | Return cached thread with state toggled locally; mark `stale = true` so the next refresh corrects it. |
| Stale cache (head_sha differs from current head) | hydration | Cache is rendered with a small "data is from commit XYZ" tag; refresh button is highlighted. |
| Concurrent refresh from two windows | cache | Last write wins. No locking. We accept this. |

---

## Security / hardening

- All `gh` invocations stay inside `infra::process` with token redaction; bodies are user content and are *not* redacted (we never log user comment bodies).
- GraphQL queries are static `&str`; user data only flows through variables, never string-concatenated into the query.
- HTML in comment bodies is sanitized at render-time using the existing Phase 5 allowlist sanitizer.
- No new file-system permissions or shell capabilities. Tauri `capabilities/default.json` only gets the seven new command names appended.

---

## Testing

- `crates/core/tests/sync_mapping.rs` — exhaustive `map_anchor` cases with in-memory `FileResolver`: outdated, exact commit match, snippet found once at new position, snippet found multiple times, snippet not found, file missing.
- `crates/core/tests/sync_refresh.rs` — end-to-end `refresh::run` with fake `GhClient` + fake `RemoteThreadsStore`: confirms partitioning into mapped/unmapped, cache write, deterministic ordering.
- `crates/core/tests/sync_mutations.rs` — each mutation use case verified against a fake `GhClient` (success, viewer-denied, 404 paths).
- `crates/infra/tests/gh_review_threads.rs` (`#[ignore]`) — parses recorded JSON fixtures (`threads-multi-line.json`, `threads-outdated.json`, `threads-resolved.json`) to guarantee the deserializer survives real shapes.
- Frontend: `bun test` for `mergeLocalAndRemote.ts` (ordering, dedupe by `(filePath, startLine)`). React Query hooks are not unit-tested; manual smoke is part of the verification checklist.

---

## Verification checklist (manual)

To be run after the branch is green on automated tests and before merge:

- [ ] Open a PR with at least one open thread, one resolved thread, and one outdated thread → refresh → all three appear in the right buckets.
- [ ] Map a thread to a single-line anchor; map a thread to a multi-line range — both render in the threads pane.
- [ ] Force an unmapped thread (rename the file locally) → it appears in the "Unmapped threads" section with the right reason.
- [ ] Reply to a remote thread → reply appears immediately, persists after refresh.
- [ ] Edit your own remote comment → body updates in place; edit button is hidden on someone else's comment.
- [ ] Delete your own remote comment → comment disappears; thread is removed if it was the only comment.
- [ ] Resolve a thread → state badge flips to `resolved`; reopen flips it back.
- [ ] Quit app, reopen the same PR → threads pane shows the cached state before clicking refresh.
- [ ] Switch PR, then come back → cache for the original PR is still there; no extra network call.
- [ ] Smoke i18n: every string visible during the above flows lives in `en.json` (no raw English in JSX).

---

## Out of scope (followups to file as issues)

- Rename detection during anchor mapping (`git diff --follow`).
- Editing or deleting one's own draft *and* the submitted GitHub copy in a single action.
- Hide-from-view for resolved remote threads (currently rendered with a `resolved` badge but still visible).
- Background refresh.
- GraphQL pagination beyond the first 100 threads — we cap at 100 and log when truncated. A follow-up will paginate via cursors when needed.

---

## Execution order (one branch, granular commits)

1. **Foundation.** Domain types, errors, contract.ts additions, migration `0004_remote_threads_cache.sql`, port traits, empty use-case modules, IPC command stubs returning `unimplemented!()`. Commit: `feat(phase-6): scaffold remote-thread domain + IPC surface`.
2. **#31 + #34 backend.** Implement `GhClient::list_review_threads`, `map_anchor`, `application::sync::refresh::run`. Wire `refresh_remote_comments` + `get_cached_remote_threads`. Commit: `feat(phase-6 #31 #34): refresh + anchor mapping with unmapped classification`.
3. **#33 backend.** `SqliteRemoteThreadsStore`, hydration query, cache invalidation in refresh. Commit: `feat(phase-6 #33): per-PR cache with explicit invalidation`.
4. **#32 backend.** Mutation methods on `GhClient` + use cases + IPC commands. Commit: `feat(phase-6 #32): reply/edit/delete/resolve remote threads`.
5. **Frontend foundation.** Hooks, merge helper, `sync.*` i18n keys. Commit: `feat(phase-6): sync feature hooks and merge helper`.
6. **Frontend UI.** `RemoteThreadCard`, `RemoteReplyComposer`, `UnmappedThreadsSection`, `ThreadsPane` integration, `RefreshButton` extension. Commit: `feat(phase-6 #31 #32 #34): integrate remote threads into ThreadsPane`.
7. **Verification.** `cargo fmt`, `cargo clippy -D warnings`, `cargo test --workspace`, `bun run check`, `bun run typecheck`, `bun run build:web`, manual smoke. Commit fixes as needed; final commit `chore(phase-6): verification fixes`.
8. Open PR titled `feat(phase-6): GitHub sync — refresh, mutations, cache, unmapped` referencing all four issues.

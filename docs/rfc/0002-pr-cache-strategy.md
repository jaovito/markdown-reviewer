# RFC 0002 — PR Cache & Refresh Strategy

- **Status:** Draft
- **Author:** @jaovito
- **Created:** 2026-04-15
- **Target milestone:** Phase 4 — GitHub Sync

## Context

Markdown Reviewer is **local-first** and explicit-refresh: we never poll
GitHub in the background. But we still need to render PR metadata (files,
diffs, existing review comments) without paying the latency of `gh` calls
on every navigation. This RFC defines the cache shape and invalidation
rules.

## Cache shape

We persist into the local SQLite database (`~/.markdown-reviewer/cache.db`):

```sql
CREATE TABLE pr_cache (
  repo        TEXT NOT NULL,
  number      INTEGER NOT NULL,
  head_sha    TEXT NOT NULL,
  fetched_at  INTEGER NOT NULL, -- unix ms
  payload     BLOB NOT NULL,    -- gzipped JSON
  PRIMARY KEY (repo, number)
);

CREATE TABLE pr_files (
  repo   TEXT NOT NULL,
  number INTEGER NOT NULL,
  path   TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('added','modified','removed','renamed')),
  PRIMARY KEY (repo, number, path)
);
```

`payload` holds the merged response from `gh pr view --json` plus
`gh pr diff`, gzipped to keep the row well under 1 MB for typical PRs.

## Invalidation matrix

| Event | Action |
|---|---|
| User clicks **Refresh** | Force re-fetch, overwrite row |
| `head_sha` changed since last fetch (detected via `gh pr view`) | Re-fetch |
| User switches repo | Keep cache, just stop showing it |
| User submits a review | Re-fetch only the comments slice |
| Cache row older than **24 h** | Show ⚠️ "stale" badge, no auto-refresh |
| App launch | Use cache as-is, never network |

## Sequence

```mermaid
sequenceDiagram
    participant UI
    participant Tauri as Tauri Cmd
    participant DB as SQLite
    participant GH as gh CLI

    UI->>Tauri: load_pull_request(repo, 42)
    Tauri->>DB: SELECT pr_cache WHERE ...
    alt cache hit (fresh)
        DB-->>Tauri: payload
        Tauri-->>UI: PullRequest (from cache)
    else miss or refresh
        Tauri->>GH: gh pr view 42 --json ...
        GH-->>Tauri: JSON
        Tauri->>DB: UPSERT pr_cache
        Tauri-->>UI: PullRequest (fresh)
    end
```

## Tauri command surface

```rust
#[tauri::command]
pub async fn load_pull_request(
    repo: String,
    number: u32,
    refresh: bool,
) -> Result<PullRequest, AppError> {
    if !refresh {
        if let Some(hit) = cache::get(&repo, number).await? {
            return Ok(hit);
        }
    }
    let fresh = gh::view(&repo, number).await?;
    cache::upsert(&repo, number, &fresh).await?;
    Ok(fresh)
}
```

## Risks

> ⚠️ **Risk:** stale comments after a force-push. Because we cache by
> `head_sha`, comments anchored to lines that no longer exist will fall
> into the "stale" tray defined in [RFC 0001](./0001-comment-anchoring.md).
> We must surface a clear banner when `head_sha` advances.

> 💡 **Mitigation:** show a non-blocking toast `"Branch updated — refresh
> to see latest"` whenever a foreground action returns a `head_sha` we
> haven't seen.

## Out of scope

- Background sync (explicitly forbidden by product principles).
- Cross-device cache (each install is independent).
- Caching binary attachments (images, PDFs) — those stream from GitHub on
  demand.

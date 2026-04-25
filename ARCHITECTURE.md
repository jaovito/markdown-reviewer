# Architecture

Living document. Keep it in sync when you change module boundaries, data flow, or tech choices. If a decision is relevant for more than one feature, it probably belongs here.

---

## Top-level layout

```
markdown-reviewer/
├── src/                # React frontend (feature-first)
├── src-tauri/          # Tauri binary — thin shell that wires crates to the webview
├── crates/             # Rust business logic
│   ├── core/           # domain + use cases + ports (no IO)
│   ├── infra/          # adapters: git, gh, sqlite, process, paths, logging
│   └── ipc/            # Tauri command bindings
├── index.html          # Vite entry (imports /src/main.tsx)
├── vite.config.ts      # Vite + React + Tailwind v4
├── Cargo.toml          # workspace root
├── package.json        # Bun-managed JS deps
├── biome.json          # TS/CSS/JSON lint + format
├── rustfmt.toml · clippy.toml
├── tsconfig.json
├── .vscode/            # editor defaults
└── CLAUDE.md · ARCHITECTURE.md
```

**Known friction:** the repo root mixes frontend config (`vite.config.ts`, `index.html`, `biome.json`, `tsconfig.json`) with Rust config (`Cargo.toml`, `rustfmt.toml`, `clippy.toml`). This is deliberate — it follows the `create-tauri-app` convention and keeps paths short for contributors. If this becomes painful we can move `Cargo.toml` + crates under `rust/` and point `src-tauri` at it, but that fights Tauri CLI defaults. Revisit if contributor confusion outweighs the cost.

---

## Rust side — hexagonal-lite, async

Dependencies point inward. `core` knows nothing about Tauri, SQLite, or the filesystem.

```
┌──────────────────────── src-tauri ──────────────────────┐
│  main.rs → bootstrap.rs                                 │
│  Wires Paths → DB → adapters → use cases → Tauri state  │
└─────────────┬────────────────────────┬──────────────────┘
              │ depends on             │ depends on
              ▼                        ▼
         ┌────────┐              ┌────────┐
         │  ipc   │──depends──►  │ infra  │──depends──► core
         └────────┘              └────────┘               ▲
              └──────── depends on ────────┘              │
                          ▼                               │
                       ┌──────┐   defines ports ──────────┘
                       │ core │
                       └──────┘
```

### `crates/core`

Pure types, pure rules. No `tokio::fs`, no `rusqlite`, no `std::process`. Uses `tokio` only for `async_trait`. Layout:

- `domain/` — value objects and entities (`Repository`, `RemoteUrl`, `ToolStatus`, future `PullRequest`, `ReviewComment`).
- `application/` — use cases organized by feature family. Each family is a module that takes a struct of `Arc<dyn Port>` and exposes free functions. Example: `application::repo_selection::{validate_repository, check_tools, recents::{list, add, remove}}`.
- `ports/` — traits the application layer depends on: `GitClient`, `GhClient`, `Clock`, `RecentsStore`. One trait per external concern.
- `error.rs` — single `AppError` enum, `#[serde(tag = "kind", content = "data")]`, serialized verbatim across IPC.

### `crates/infra`

Production implementations of ports, organized by adapter family.

- `process/` — structured `tokio::process::Command` helpers with timeouts and token redaction (`redact.rs`). No other module shells out.
- `git/` — `GitCli` implements `GitClient` using `process::run`.
- `gh/` — `GhCli` implements `GhClient`.
- `sqlite/` — `connection.rs` opens the DB and runs numbered migrations embedded via `include_str!`; stores are one file each (`recents_store.rs`, `ui_state_store.rs`, …).
- `clock.rs`, `paths.rs`, `logging.rs` — misc adapters.

### `crates/ipc`

Thin Tauri adapters. Each `#[tauri::command]` is ~5 lines: deserialize DTO, call a use case, serialize result. No business logic.

- `commands/` — one file per feature family (`repo.rs`, `tools.rs`, `recents.rs`, future `pull_requests.rs`, `comments.rs`).
- `dto.rs` — serde structs at the boundary.
- `state.rs` — `AppState` holding the `Arc<dyn …>` bundles the use cases need.
- `lib.rs::register()` — the only function `src-tauri` calls to bind handlers.

### `src-tauri`

Tauri binary. `bootstrap::run()` builds `Paths`, opens the SQLite DB, runs migrations, constructs adapters, injects them into the use-case bundle, registers the handler from `ipc::register`, and starts the Tauri app. Also holds the tracing `WorkerGuard` in Tauri state so logs don't drop.

### Adding a Rust capability — checklist

1. Define the domain type in `core/domain/*`.
2. Declare the port in `core/ports/*` (or extend an existing one).
3. Write the use case in `core/application/<feature>/*.rs`. Unit-test it in `crates/core/tests/` with in-memory fakes.
4. Implement the port in `crates/infra/*`. Integration-test it with `tempfile` (mark `#[ignore]` so `cargo test` stays fast).
5. Add a `#[tauri::command]` in `crates/ipc/commands/<feature>.rs`. Register it in `ipc::register`.
6. Mirror the contract on the frontend (`src/shared/ipc/contract.ts`) and add the client helper.
7. If the command needs permissions, extend `src-tauri/capabilities/default.json` (never grant `shell:allow-execute`).

**Command argument convention.** Tauri v2 derives each argument key from the Rust parameter name. For commands taking 0 or 1 fields, pass scalars directly:

```rust
#[tauri::command]
pub async fn validate_repository(state: State<'_, AppState>, path: String) -> Result<Repository, AppError> { … }
```

```ts
invoke("validate_repository", { path });
```

Only introduce a DTO struct in `crates/ipc/src/dto.rs` when a command takes multiple fields that belong together — and in that case pass them as named parameters, not wrapped in an `args` struct, unless you also send `{ args: {...} }` from the frontend.

---

## Frontend — feature-first React

```
src/
├── main.tsx            # renders <App/> into #root; imports /shared/styles/index.css
├── app/                # shell: providers, router (Phase 2+), error boundary
├── features/           # one folder per product surface
│   ├── onboarding/
│   │   ├── routes/     # top-level screen(s) the router renders
│   │   ├── components/ # feature-local components
│   │   ├── hooks/      # feature-local hooks (wrap React Query calls)
│   │   └── index.ts    # re-exports the public surface
│   ├── pull-requests/  # Phase 2
│   ├── file-explorer/  # Phase 2
│   ├── markdown-preview/ # Phase 2 / 5
│   ├── comments/       # Phase 3 / 4
│   ├── sync/           # Phase 6
│   └── settings/
└── shared/             # cross-feature code
    ├── ipc/            # contract.ts, client.ts, errors.ts
    ├── ui/             # shadcn-style primitives (button, card, alert, badge, separator)
    ├── lib/            # cn, result, logger
    ├── hooks/          # cross-feature hooks
    ├── stores/         # cross-feature Zustand stores (last-PR, sidebar width)
    ├── i18n/           # i18next config + locales (en today; more later)
    └── styles/         # Tailwind entry + design tokens
```

### Rules of thumb

- **Features don't import from each other.** If feature A needs something from feature B, it belongs in `shared/` or the feature's public `index.ts`.
- **`shared/ui` is unopinionated.** No business logic, no IPC calls. Pure presentation primitives. New primitives come from the shadcn CLI: `bunx --bun shadcn@latest add <component>` installs into `src/shared/ui/` with the `@/shared/lib/cn` alias preserved (see `components.json`). Run `bun run check:fix` after each install so Biome reformats the shadcn output to match project style. Components already in `src/shared/ui` from Phase 1 (button, card, alert, badge, separator, skeleton) can stay as-is; prefer the shadcn-generated versions for anything new.
- **All IPC goes through `shared/ipc/client.ts`.** No `invoke("…")` inline. The client returns `Result<T, AppError>` — features choose whether to `throw` (for React Query) or handle inline.
- **Error mapping is centralized.** `shared/ipc/errors.ts::describeError(AppError)` returns `{ title, description, actionHint? }`. Features just render it.
- **Server state → React Query; client UI state → Zustand** (not yet used; introduce when a feature needs it, keep stores small and feature-local).
- **Routing: React Router (declarative mode)** — introduce in Phase 2 when the second screen lands. Code-based routes in `app/routes.tsx`. Search params validated with a tiny zod helper in `shared/lib/search-params.ts` (to be added).
- **i18n is non-negotiable.** Every user-facing string flows through `i18next`. Components call `useTranslation()` and read `t("feature.key")`; for inline JSX use `<Trans>` with the `components` map. The error helper in `shared/ipc/errors.ts` uses the singleton `i18next` instance so `describeError` works outside React.

### i18n conventions

- **Locales live in `src/shared/i18n/locales/<lang>.json`.** Today only `en.json` ships; new locales drop in alongside it. The locale shape is type-checked via `src/shared/i18n/types.d.ts` so missing keys fail `tsc`.
- **Key naming.** Group by feature/domain — `onboarding.*`, `pullRequests.list.*`, `fileExplorer.sidebar.*`, `main.threads.*`, `errors.<kind>.*`. Reuse cross-cutting strings from the `app.*` namespace (`app.actions.refresh`, `app.actions.retry`, `app.states.somethingWrong`).
- **Interpolation** uses i18next's `{{var}}` syntax. Plurals use the suffix convention (`_one`, `_other`) — e.g. `emptyAllNonMarkdown_one` / `emptyAllNonMarkdown_other` driven by a `count` value.
- **Inline JSX** (e.g. an `<code>` inside a sentence) goes through `<Trans>` with a `components` prop, never via string concatenation.
- **Default language is `en`.** No detection wired yet; the language picker lands when settings ship. Until then, prefer concise, neutral English copy that translates well.

### Adding a frontend feature — checklist

1. Create `src/features/<name>/` with `routes/`, `components/`, `hooks/`, `index.ts`.
2. Build hooks that wrap `ipc.*` calls; throw `AppError` so React Query surfaces them.
3. Compose screens from `shared/ui` primitives. Only reach into `shared/` — never into a sibling feature.
4. **Add every user-facing string to `src/shared/i18n/locales/en.json`** under a feature-scoped key, then read it via `useTranslation()` (`<Trans>` for inline JSX). No raw strings in JSX, alerts, tooltips, or aria labels.
5. Register the route in `app/routes.tsx` (Phase 2+).
6. Export just what other parts of the app need from `index.ts`; keep internals internal.

---

## IPC contract — one source of truth

Today: hand-written in two places.
- Rust: `crates/core/src/error.rs`, `crates/core/src/domain/*`, `crates/core/src/ports/*`, and `crates/ipc/src/commands/*`.
- TS mirror: `src/shared/ipc/contract.ts`.

Contract shape:
- `AppError` is a tagged union (`{ kind: "…"; data?: {…} }`).
- DTOs use `#[serde(rename_all = "camelCase")]` so TS naming matches.
- Commands are keyed by their Rust name (snake_case). `Commands[K]["args"]` and `Commands[K]["result"]` drive the typed `call()` wrapper.

When you change the Rust side, update `contract.ts` in the same commit. Contract tests live in `crates/ipc/tests/` (to be added) and pin the serialized JSON shape until we adopt `ts-rs` or `specta` for codegen. Planned migration: during Phase 2, when the surface roughly doubles.

---

## Persistence

SQLite file at `app_data_dir/markdown-reviewer.sqlite`, opened via `rusqlite` (bundled). WAL journal mode, foreign keys on. Migrations are numbered `.sql` files under `crates/infra/src/sqlite/migrations/`, embedded with `include_str!`, tracked in a `schema_migrations` table.

Current tables:
- `recent_repositories(path PK, label, remote_url, owner, repo, last_opened_at)`
- `ui_state(key PK, value)`
- `schema_migrations(name PK, applied_at)`

Planned tables (by phase):
- Phase 2: `pr_cache`, `pr_files` (with timestamps for manual invalidation).
- Phase 3: `local_comments` (draft/submitted/hidden/resolved/deleted states; survives restart).
- Phase 6: `remote_comment_map` (link local anchors to GitHub comment IDs).

Never delete or rename a migration file once it's been shipped — add a new one.

---

## Error model

- Single `AppError` enum. New variants land when a feature needs to communicate a distinct failure the UI must display differently.
- Errors serialize as `{ kind, data? }`. Frontend maps `kind` → message in `shared/ipc/errors.ts`.
- Internal errors (I/O, DB, process) collapse into `io`/`db`/`process`/`unexpected`. Message text is shown; don't embed tokens or paths you wouldn't want in a screenshot.

---

## Logging

`tracing` on the Rust side, initialized in `infra::logging::init(logs_dir)`:
- Rolling daily file appender under `app_data_dir/logs/`.
- Console layer for dev.
- Token redaction (`ghp_*`, `gho_*`, `ghu_*`, `ghs_*`, `ghr_*`, `github_pat_*`, 40-hex) applied to anything that flows through `infra::process`.

Frontend logging goes through `shared/lib/logger.ts` (thin wrapper around `console.*`). No telemetry, no external shipping.

---

## Security / capabilities

- Tauri capabilities live in `src-tauri/capabilities/`. One file per concern. Phase 1 grants `dialog:allow-open` and the six custom commands. Nothing else.
- **Never grant `shell:allow-execute` or wildcard fs scopes.** All shell execution lives inside `infra::process`, behind typed ports, with argv-only invocations (no shell interpretation).
- HTML from Markdown (Phase 5+) will be sanitized with a safe allowlist before rendering. Mermaid renders in a try/catch with a fallback block.

---

## Testing strategy

- **`crates/core/tests/`** — use-case tests with in-memory fakes (`FakeGitClient`, `FakeGhClient`, `InMemoryRecentsStore`, `FixedClock`). Runs in milliseconds; no real IO.
- **`crates/infra/tests/`** — integration tests that shell out to real `git` in `tempfile::TempDir`. Mark `#[ignore]`; run with `cargo test -- --ignored`.
- **`crates/ipc/tests/`** — contract tests calling the invoke handler with raw JSON. Pins DTO shape against `contract.ts`.
- **Frontend** — `bun test` for pure hooks/utilities. Component tests (Testing Library) deferred to Phase 2+.

---

## Build & dev

- `bun run dev` → Tauri dev shell. Tauri spawns `bun run dev:web` (Vite on `127.0.0.1:1420`) and opens the WebView pointed at it.
- `bun run build` → Tauri production bundle.
- `bun run build:web` → just the frontend (for CI smoke tests).
- `bun run typecheck` → `tsc --noEmit`.
- `bun run check` / `check:fix` → Biome lint + format.
- `bun run rust:fmt` / `rust:fmt:check` → `cargo fmt`.
- `bun run rust:lint` → `cargo clippy --workspace --all-targets -D warnings`.

CI (when added) must run: `bun run check`, `bun run typecheck`, `bun run build:web`, `cargo fmt --check`, `cargo clippy -D warnings`, `cargo test --workspace`.

---

## Stack decisions — why

| Choice | Reason | What would flip it |
|---|---|---|
| Tauri v2 | Native performance, Rust backend, small bundle | Cross-platform need Electron-only plugin |
| Bun (runtime/PM/tests) | Fast, single binary, good TS support | Tests need a Node-only dep that Bun lacks |
| Vite (bundler) | Mature ecosystem, `@tailwindcss/vite`, easier OSS contribution | Moving to a framework (Next, Remix) |
| Tailwind v4 | Zero-config via `@tailwindcss/vite`, CSS-native tokens | New design system that fights utility CSS |
| React Router declarative | Widely known, no bundler plugin, works on Bun/Vite | Need type-safe search-params beyond what a zod helper gives |
| React Query | Caching, retries, devtools, well-known | — |
| Zustand | Tiny, unopinionated, feature-local stores | — |
| Biome | Lint + format in one binary, fast, single config | Need a rule Biome can't express |
| rustfmt + clippy | Official, rust-analyzer integrates natively | — |
| `gh` CLI over REST/GraphQL | Reuses user auth, less auth code, less rate-limit surface | Need an endpoint `gh` doesn't cover |

---

## How to update this document

- When a decision above changes: update the relevant section in the same commit.
- When a new feature family appears: add a subfolder entry and list its use cases briefly.
- When a new table ships: add it to the persistence section.
- Keep it scan-friendly: if a section grows past ~25 lines, split it or move detail into a per-phase GitHub issue.
- Don't duplicate `CLAUDE.md` (guardrails/stack) or the GitHub milestones (phase-by-phase work). This doc explains *how the pieces fit together*.

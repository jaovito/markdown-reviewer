# Markdown Reviewer

Desktop app for reviewing Markdown documentation inside GitHub Pull Requests, offering a Google Docs / Notion-like commenting experience while preserving the Git/GitHub flow. Target users: product, engineering, QA, and non-technical stakeholders.

> **Status:** early development. Phase 1 (repository selection + tool validation + local persistence) is implemented. Phases 2–6 are the MVP roadmap — tracked in [GitHub milestones](https://github.com/jaovito/markdown-reviewer/milestones).

## Table of contents

- [Prerequisites](#prerequisites)
- [First-time setup](#first-time-setup)
- [Running the app](#running-the-app)
- [Project layout](#project-layout)
- [Scripts](#scripts)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [Further reading](#further-reading)

## Prerequisites

| Tool | Version | Why |
|---|---|---|
| [Bun](https://bun.sh) | ≥ 1.3 | Runtime, package manager, test runner |
| [Rust](https://rustup.rs) | stable | Tauri backend |
| [Git](https://git-scm.com) | any recent | The app shells out to `git` |
| [GitHub CLI (`gh`)](https://cli.github.com) | ≥ 2.40 | The app shells out to `gh` and relies on `gh auth` |
| Xcode CLT (macOS) | — | Required to link Tauri |
| build-essentials (Linux) | — | `webkit2gtk-4.1`, `libgtk-3-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev` — see [Tauri prerequisites](https://tauri.app/start/prerequisites/) |
| Visual Studio 2022 Build Tools (Windows) | — | Same as Tauri's prerequisites |

### Install Bun

```sh
curl -fsSL https://bun.sh/install | bash
```

### Install Rust

```sh
# Option A — Homebrew on macOS
brew install rustup
rustup-init -y --default-toolchain stable

# Option B — official installer (any OS)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y

# Load cargo into your current shell
source "$HOME/.cargo/env"

# Sanity check
rustc --version && cargo --version
```

### Install and authenticate `gh`

```sh
# macOS
brew install gh

# Authenticate (opens a browser)
gh auth login
gh auth status    # should report "Logged in to github.com"
```

### macOS — Xcode Command Line Tools

```sh
xcode-select -p || xcode-select --install
```

## First-time setup

```sh
git clone <this repo>
cd markdown-reviewer

bun install           # JS/TS deps — fast
```

The first `bun run dev` will compile the Rust workspace, which downloads roughly 100 crates (`tauri`, `rusqlite`, `tokio`, …). Expect **3–5 minutes**. This happens once; subsequent builds are incremental and take seconds.

## Running the app

```sh
bun run dev
```

What happens, in order:

1. Tauri CLI spawns `bun run dev:web` in the background → Vite serves the frontend on `http://127.0.0.1:1420` with HMR.
2. `cargo build` compiles the Rust workspace.
3. A native window opens pointed at Vite's dev server.

Stop with `Ctrl+C` in the terminal.

### Frontend-only

To iterate on UI without spinning up Tauri (faster feedback, runs in your normal browser):

```sh
bun run dev:web
# → http://127.0.0.1:1420
```

Any `invoke()` call to a Tauri command will fail in this mode — you'll see errors in the console. Use it for visual work only.

## What you should see

The app opens on the **Select Repository** screen:

- **Environment** panel — three status badges for `git`, `gh`, and `gh auth`. Each shows OK / missing / not authenticated with an actionable hint.
- **Select repository folder** button — opens the native folder picker.
- **Recent repositories** list — empty on first run.

### Phase 1 acceptance scenarios

| Action | Expected |
|---|---|
| Select a folder that isn't a Git repo | Red alert: *Not a Git repository* |
| Select a Git folder without a GitHub remote | Red alert: *No GitHub remote* |
| Select a valid GitHub-backed repo | Green card with `owner/repo`, branch, remote URL. Entry appears under **Recent repositories**. |
| Close and reopen the app | The Recent entry persists (SQLite) |
| Click **×** next to a Recent | Entry removed from the list and database |
| Run `gh auth logout`, refresh | **GitHub auth** badge turns yellow with "not authenticated" |
| Run the app with `gh` missing from `PATH` | **GitHub CLI** badge turns red with the install hint |

## Roadmap

Work is tracked as GitHub issues grouped by phase milestone:

| Milestone | Scope |
|---|---|
| [Phase 1 — Setup & Repository Selection](https://github.com/jaovito/markdown-reviewer/milestone/1) | Bootstrap + repo selection + tool status. **Implemented.** |
| [Phase 2 — Main Visualization](https://github.com/jaovito/markdown-reviewer/milestone/2) | Open a PR, browse files, render baseline preview. |
| [Phase 3 — Local-First Comments](https://github.com/jaovito/markdown-reviewer/milestone/3) | Create / edit / delete local comments, submit batch. |
| [Phase 4 — Advanced Comments](https://github.com/jaovito/markdown-reviewer/milestone/4) | Many per line, hide, resolve, long ranges. |
| [Phase 5 — GitHub-parity Preview](https://github.com/jaovito/markdown-reviewer/milestone/5) | GFM, Shiki, Mermaid, sanitization, images. |
| [Phase 6 — GitHub Sync](https://github.com/jaovito/markdown-reviewer/milestone/6) | Fetch remote comments, reply/resolve, cache. |
| [Phase 7 — Repo Cloning](https://github.com/jaovito/markdown-reviewer/milestone/7) | Search + clone repos from inside the app (post-MVP). |

Cross-cutting tracking issues live under the [`tracking`](https://github.com/jaovito/markdown-reviewer/labels/tracking) label (risks, product principles, manual acceptance suite).

### Runtime files

The app writes its local state under the OS-standard app-data directory:

| OS | Path |
|---|---|
| macOS | `~/Library/Application Support/com.weqora.markdown-reviewer/` |
| Linux | `~/.local/share/com.weqora.markdown-reviewer/` |
| Windows | `%APPDATA%\com.weqora.markdown-reviewer\` |

Inside you'll find:

- `markdown-reviewer.sqlite` — recent repos, UI state (comments/PR cache later).
- `logs/markdown-reviewer.log.<date>` — tracing logs with token redaction applied.

## Project layout

```
markdown-reviewer/
├── src/                        # React frontend (feature-first)
│   ├── app/                    # shell: providers, (router in Phase 2+)
│   ├── features/
│   │   ├── onboarding/         # Phase 1 — repo selection
│   │   ├── pull-requests/      # Phase 2
│   │   ├── file-explorer/      # Phase 2
│   │   ├── markdown-preview/   # Phase 2 / 5
│   │   ├── comments/           # Phase 3 / 4
│   │   ├── sync/               # Phase 6
│   │   └── settings/
│   └── shared/
│       ├── ipc/                # contract + typed client + error mapping
│       ├── ui/                 # shadcn-style primitives
│       ├── lib/ · hooks/ · styles/
│       └── …
├── src-tauri/                  # Tauri binary + config
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/           # per-phase permission bundles
│   ├── icons/
│   └── src/                    # main.rs, bootstrap.rs
├── crates/
│   ├── core/                   # domain + use cases + ports (no IO, no Tauri)
│   ├── infra/                  # adapters: git, gh, sqlite, process, paths, logging
│   └── ipc/                    # Tauri command bindings
├── index.html                  # Vite entry (imports /src/main.tsx)
├── vite.config.ts
├── Cargo.toml                  # Rust workspace manifest
├── package.json                # Bun-managed JS deps
├── biome.json · rustfmt.toml · clippy.toml
├── tsconfig.json
├── .vscode/                    # recommended extensions + workspace settings
├── CLAUDE.md                   # guardrails for AI collaborators
├── ARCHITECTURE.md             # how the pieces fit together — read this
└── (roadmap lives in GitHub milestones / issues)
```

[`ARCHITECTURE.md`](./ARCHITECTURE.md) is the document to read before adding a new feature, command, crate, or migration.

## Scripts

### JavaScript / TypeScript

```sh
bun run dev            # Tauri dev shell (recommended)
bun run dev:web        # Just Vite (frontend-only, in browser)
bun run build          # Production Tauri bundle
bun run build:web      # Just the frontend (for CI smoke tests)
bun run preview:web    # Preview the built frontend locally

bun run typecheck      # tsc --noEmit
bun run check          # Biome lint + format check
bun run check:fix      # Biome auto-fix
bun run lint           # Biome lint only
bun run format         # Biome format only
bun run test           # bun test (pure TS units)
```

### UI components (shadcn)

New UI primitives come from the [shadcn](https://ui.shadcn.com) CLI, configured via `components.json`:

```sh
bunx --bun shadcn@latest add <component>     # e.g. dialog, dropdown-menu, tabs
bun run check:fix                            # reformat shadcn output to match Biome style
```

The CLI installs components into `src/shared/ui/` and resolves imports through the `@/shared/lib/cn` and `@/shared/ui` aliases. Foundational primitives from Phase 1 (`button`, `card`, `alert`, `badge`, `separator`, `skeleton`) are already in place.

### Rust

```sh
bun run rust:fmt       # cargo fmt --all
bun run rust:fmt:check # cargo fmt --all -- --check
bun run rust:lint      # cargo clippy --workspace --all-targets -- -D warnings

cargo test --workspace                                          # unit tests, fast
cargo test -p markdown-reviewer-infra -- --ignored              # integration (real git)
cargo build --workspace                                         # build all crates
```

### Recommended pre-push gauntlet

```sh
bun run check && bun run typecheck && bun run build:web \
  && bun run rust:fmt:check && bun run rust:lint \
  && cargo test --workspace
```

## Testing

Three layers:

1. **`crates/core/tests/`** — use-case tests with in-memory fakes (`FakeGitClient`, `FakeGhClient`, `InMemoryRecentsStore`, `FixedClock`). Sub-millisecond, run every save.
2. **`crates/infra/tests/`** — integration tests that shell out to real `git` in `tempfile::TempDir`. Marked `#[ignore]`; run explicitly with `-- --ignored`.
3. **`crates/ipc/tests/`** — contract tests that keep the Rust DTOs aligned with `src/shared/ipc/contract.ts` (to be expanded in Phase 2 before codegen).

Frontend tests land in Phase 2 with the first component that deserves a Testing Library exercise.

## Troubleshooting

### `cargo: command not found`

```sh
source "$HOME/.cargo/env"
# or open a fresh shell
```

### `xcrun: error: invalid active developer path`

```sh
xcode-select --install
```

### Tauri window opens blank

Vite probably hasn't finished booting. Wait ~5 seconds and reload (`Cmd+R` / `Ctrl+R`). If it persists, open DevTools (`Cmd+Option+I` on macOS in dev builds) and check the console.

### `Error: listen EADDRINUSE 127.0.0.1:1420`

Something is already on Vite's port. Either kill it or change `server.port` in `vite.config.ts` (and `devUrl` in `src-tauri/tauri.conf.json`).

### "The `gh` CLI is not authenticated"

```sh
gh auth login
gh auth status   # should say "Logged in to github.com"
```

### Resetting local state

Close the app, then delete the app-data directory (see [Runtime files](#runtime-files)). Next launch starts from an empty database.

## Contributing

This project is pre-alpha and the surface area will change frequently. If you want to jump in:

1. Read [`CLAUDE.md`](./CLAUDE.md) — the product principles and mandatory stack rules.
2. Read [`ARCHITECTURE.md`](./ARCHITECTURE.md) — how to add a new feature, command, crate, or migration.
3. Check the [GitHub milestones](https://github.com/jaovito/markdown-reviewer/milestones) — the phase roadmap. Pick an open issue (start with `good first issue` or the current phase), comment to claim it, then open a PR that closes it.
4. Before pushing: `bun run check && bun run typecheck && bun run rust:fmt:check && bun run rust:lint && cargo test --workspace`.

Editor setup: the workspace ships `.vscode/extensions.json` with recommended extensions (Biome, rust-analyzer, Tauri, Tailwind). VSCode/Cursor will prompt to install them on first open. `settings.json` enables format-on-save via Biome (TS/CSS/JSON) and rust-analyzer (Rust).

## Further reading

- [`CLAUDE.md`](./CLAUDE.md) — project context and technical guardrails.
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — module boundaries, dependency rules, IPC contract, persistence, testing.
- [GitHub milestones](https://github.com/jaovito/markdown-reviewer/milestones) — Phase 1 through Phase 7, with acceptance criteria on each issue.
- [Tauri v2 docs](https://tauri.app) · [Bun docs](https://bun.sh/docs) · [Vite docs](https://vitejs.dev) · [Tailwind v4 docs](https://tailwindcss.com) · [GitHub CLI docs](https://cli.github.com/manual/).

## License

Not yet decided. Everything is currently unlicensed; a permissive license (MIT or Apache-2.0) will be chosen before the first public release.

---
description: Markdown Reviewer project context and mandatory technical guidelines.
globs: "*.ts, *.tsx, *.rs, *.html, *.css, *.js, *.jsx, package.json, tauri.conf.json"
alwaysApply: true
---

# Markdown Reviewer

Desktop app for reviewing Markdown documentation inside GitHub Pull Requests, offering a Google Docs / Notion-like commenting experience while preserving the Git/GitHub flow. Target users: product, engineering, QA, and non-technical stakeholders.

Phases, deliverables, and acceptance criteria are tracked as **GitHub issues** grouped by milestone (Phase 1 → Phase 7) at [`github.com/jaovito/markdown-reviewer/milestones`](https://github.com/jaovito/markdown-reviewer/milestones). Three tracking issues (`risk`, `tracking`) hold the product principles, risks, and manual acceptance checklist. Before starting work, check the relevant milestone and the feature issues it contains.

How the pieces fit together (folder layout, dependency rules, IPC contract, persistence, testing) lives in `ARCHITECTURE.md`. Consult it before adding a new feature, crate, or command — and update it in the same commit when you change a decision it documents.

## Product principles

- The rendered Markdown preview is the main screen, not the raw diff.
- Comments are visually anchored to the commented snippet.
- Local-first: comments work without hitting the GitHub API until an explicit submit.
- Submit and remote refresh are always explicit; no automatic polling.
- Hidden and resolved comments remain traceable via discreet markers.
- UI must be comfortable for non-technical users.

## Stack

- Tauri v2 + Rust for the local backend (filesystem, Git, GitHub CLI, persistence).
- React + TypeScript in the frontend, running inside the Tauri WebView.
- Bun as runtime, package manager, and test runner.
- Vite as the frontend dev server and bundler (chosen over the Bun bundler for ecosystem maturity — `@tailwindcss/vite`, `@vitejs/plugin-react`, wider plugin support — and for smoother open-source contribution).
- Tailwind v4 + shadcn/ui-style primitives, following the `cZVML` and `markdownReviewExamples` screens in `design.pen`.
- React Router (declarative mode) for navigation, introduced when the second screen lands in Phase 2.
- `i18next` + `react-i18next` for translations; English is the default language and the only one shipped today (the language picker comes later).
- unified / remark / rehype for Markdown; `remark-gfm` for GFM.
- Shiki for syntax highlighting; Mermaid rendered client-side with a safe fallback.
- Local SQLite for drafts, PR cache, UI state, and recent repositories (native SQLite on the Rust side).

## Architecture rules

- Tauri commands are small, typed, and explicitly allowlisted. No arbitrary shell is exposed to the frontend.
- Every `git` / `gh` call takes structured parameters and returns typed JSON.
- GitHub integration prefers the `gh` CLI; hit the REST/GraphQL API only when no CLI alternative exists.
- Local logs help debugging without leaking tokens or sensitive content.
- Sanitize HTML from Markdown with a safe allowlist; Mermaid and oversized code blocks have fallbacks.
- PR cache is timestamped and invalidated when switching PR/branch or on manual refresh.
- Drafts survive restarts and partial submit failures (never duplicate already-submitted comments when retrying).
- **No hardcoded user-facing strings on the frontend.** Anything a user can read — labels, placeholders, tooltips, alert titles, empty/error/loading copy — must go through `i18next`. Add the key to `src/shared/i18n/locales/en.json` (grouped by feature) and read it via `useTranslation()` (`<Trans>` for inline JSX). The error mapping helper (`shared/ipc/errors.ts`) uses the singleton `i18next` instance so it works outside React. Default language is English; we'll wire other locales when the language picker lands. ARCHITECTURE.md has the full convention.

## Expected Tauri commands

The full command surface lives in the per-phase issues (see milestones). Highlights: `select_repository`, `validate_repository`, `check_tools`, `list_pull_requests`, `load_pull_request`, `read_markdown_file`, `load_file_diff`, `create_local_comment`, `submit_review`, `refresh_remote_comments`.

## Comment states

`draft`, `submitted`, `hidden`, `resolved`, `deleted`. Semantics defined in the Phase 3/4 issues.

## Phases

MVP covers phases 1–6. Phase 7 (repo cloning / search) is out of the initial MVP. Confirm each phase's acceptance criteria before closing it.

## Out of MVP

Cloning repos from the app, global org-wide repo search, providers beyond GitHub, offline review without a local repo, real-time collaboration, background auto-sync.

---

# Bun guidelines (mandatory)

Default to Bun for runtime, package management, and tests. Vite owns the frontend build pipeline.

- `bun install` instead of `npm/yarn/pnpm install`
- `bun run <script>` instead of `npm/yarn/pnpm run <script>` (scripts themselves may call `vite`, `tsc`, etc.)
- `bun test` instead of `jest` or `vitest` for Node-side/utility tests
- `bun <file>` instead of `node <file>` or `ts-node <file>` for one-off scripts
- `bunx <package> <command>` instead of `npx`
- Bun auto-loads `.env`; don't use `dotenv`.
- `bun run dev` / `bun run build` delegate to Tauri, which calls `bun run dev:web` (→ `vite`) and `bun run build:web` (→ `vite build`) internally.

## Bun APIs (when writing helpers, not the frontend build)

- `Bun.serve()` instead of `express` for any standalone local server.
- `bun:sqlite` instead of `better-sqlite3` for any Node-side SQLite work.
- `Bun.file` instead of `node:fs` readFile/writeFile.
- `Bun.$\`ls\`` instead of `execa`.

## Testing

```ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Frontend build

Vite owns bundling and HMR. Entry is `index.html` at the repo root importing `/src/main.tsx`; the app lives under `src/` (feature-first). Tauri's `tauri.conf.json` points `build.devUrl` at `http://localhost:1420` and runs `bun run dev:web` (`vite`) before launching the WebView.

```ts
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 1420, strictPort: true },
});
```

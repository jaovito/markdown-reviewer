---
description: Scaffold a new frontend feature folder under `src/features/` following the project's feature-first conventions.
argument-hint: <feature-name>
---

Create a new feature folder for `$ARGUMENTS` under `src/features/$ARGUMENTS/`.

Follow the patterns of the existing features (`comments`, `file-explorer`, `main`, `markdown-preview`, `onboarding`, `pull-requests`, `settings`, `sync`):

1. Inspect the closest existing feature first; match its file structure (components, hooks, types, index).
2. Create `src/features/$ARGUMENTS/index.ts` exporting the public surface.
3. Add a top-level i18n namespace in `src/shared/i18n/locales/en.json` for the feature, using the project's casing conventions (`onboarding`, `pullRequests`, `fileExplorer`, …) — do NOT nest under `features.*`.
4. If the feature needs IPC, add the type to `src/shared/ipc/contract.ts` and the helper to `src/shared/ipc/client.ts`. Features call the shared `ipc` client wrapper, never `invoke()` directly.
5. If it needs cross-feature state, add a store in `src/shared/stores/`.
6. Run `bunx biome check --apply` on the new files.

Hand off to the `react-feature-builder` sub-agent for the actual implementation. Hand off to `i18n-guardian` before finishing.

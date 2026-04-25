---
description: Scaffold a new frontend feature folder under `src/features/` following the project's feature-first conventions.
argument-hint: <feature-name>
---

Create a new feature folder for `$ARGUMENTS` under `src/features/$ARGUMENTS/`.

Follow the patterns of the existing features (`comments`, `file-explorer`, `main`, `markdown-preview`, `onboarding`, `pull-requests`, `settings`, `sync`):

1. Inspect the closest existing feature first; match its file structure (components, hooks, types, index).
2. Create `src/features/$ARGUMENTS/index.ts` exporting the public surface.
3. Add an i18n namespace in `src/shared/i18n/locales/en.json` under `features.$ARGUMENTS`.
4. If the feature needs IPC, extend `src/shared/ipc/contract.ts` (don't call `invoke()` from the feature).
5. If it needs cross-feature state, add a store in `src/shared/stores/`.
6. Run `bunx biome check --apply` on the new files.

Hand off to the `react-feature-builder` sub-agent for the actual implementation. Hand off to `i18n-guardian` before finishing.

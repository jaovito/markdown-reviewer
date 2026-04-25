---
description: Audit the current diff (or the whole frontend) for hardcoded user-facing strings and i18next violations.
argument-hint: [path | "all"]
---

Run the `i18n-guardian` sub-agent on `$ARGUMENTS` (default: files changed vs `main`).

If no argument, run `git diff --name-only main...HEAD -- 'src/**/*.ts' 'src/**/*.tsx'` first and pass the list to the guardian.
If argument is `all`, audit `src/features/**` and `src/shared/ui/**`.
Otherwise, audit the provided path.

Return the punch list verbatim from the guardian, then ask the user whether to apply the fixes.

# Phase 5 / #26 — GFM Support (Design)

**Status:** Draft · **Date:** 2026-06-22 · **Branch:** `feat/phase-5-gfm` · **Milestone:** [Phase 5 — GitHub-parity Markdown Preview](https://github.com/jaovito/markdown-reviewer/milestone/5)

Implements the first Phase 5 issue:

- [#26](https://github.com/jaovito/markdown-reviewer/issues/26) — GFM support: tables, task lists, blockquotes, strikethrough, autolinks, **and** GitHub-style alerts (`> [!NOTE]`).

Ships on a single branch / one PR. The product principles from `CLAUDE.md` apply: the rendered preview is the main screen, HTML is sanitized with a safe allowlist, and **no user-facing string is hardcoded on the frontend** (alert titles go through `i18next`).

---

## Goals

1. The Markdown preview renders GFM tables, task lists (checked/unchecked, non-interactive), strikethrough, and autolinks, matching GitHub visually where reasonable.
2. Blockquotes that open with a `[!NOTE]` / `[!TIP]` / `[!IMPORTANT]` / `[!WARNING]` / `[!CAUTION]` marker render as GitHub-style alert callouts: colored left border, type icon, and a translated title; regular blockquotes are untouched.
3. The HTML sanitize allowlist stays tight — only the specific class values and `data-*` attributes the new constructs need are added; no `svg`/`path`/script surface is opened.
4. Comment anchoring and the diff gutter keep working over the new constructs (table rows, alert blocks) via the existing `data-source-line` mechanism.

## Non-goals

- Syntax highlighting (Shiki) — issue [#27](https://github.com/jaovito/markdown-reviewer/issues/27).
- Mermaid rendering — issue [#28](https://github.com/jaovito/markdown-reviewer/issues/28).
- Broader/hardened HTML sanitization sweep — issue [#29](https://github.com/jaovito/markdown-reviewer/issues/29).
- Relative images and local file links — issue [#30](https://github.com/jaovito/markdown-reviewer/issues/30).
- External-link click behavior (opening `http(s)` links in the system browser). This is pre-existing for regular `[text](url)` links today and is **not** introduced by enabling autolinks; it belongs with #30 / a later link-handling pass.
- Footnotes UI styling beyond what `remark-gfm` + the existing prose styles already produce. (`remark-gfm` enables footnotes; we keep the default markup and let baseline styles cover it.)

---

## Architecture

All changes are frontend-only, inside the `markdown-preview` feature plus shared styles and i18n. No Rust/IPC changes.

### File summary

```
src/
  features/markdown-preview/lib/
    pipeline.ts            (extend)  add remarkGfm + remarkGithubAlerts to the unified chain; widen sanitize schema
    remarkGithubAlerts.ts  (new)     mdast transform: [!TYPE] blockquote -> alert div
    remarkGithubAlerts.test.ts (new) plugin unit tests (structure, label injection, non-alert passthrough)
    pipeline.test.ts       (new)     end-to-end renderMarkdown() HTML assertions + sanitization
  shared/i18n/locales/
    en.json                (extend)  new `markdownPreview.alerts.*` group
  shared/styles/
    index.css              (extend)  task-list, table polish, alert callout styles
    tokens.css             (extend)  alert color tokens (light + dark)

package.json               (extend)  add `remark-gfm` dependency
```

### Pipeline order

```
unified()
  .use(remarkParse)
  .use(remarkGfm)            // tables, task lists, strikethrough, autolinks, footnotes
  .use(remarkSourceLine)     // stamps data-source-line on block nodes (unchanged)
  .use(remarkGithubAlerts)   // [!TYPE] blockquote -> alert div, preserving data-source-line
  .use(remarkRehype, { allowDangerousHtml: false })
  .use(rehypeSanitize, schema)
  .use(rehypeStringify)
```

`remarkGithubAlerts` runs **after** `remarkSourceLine` so the alert block inherits the `data-source-line` already stamped on the source blockquote — keeping comment/diff anchoring intact on the alert.

### `remarkGithubAlerts` plugin

- Visits `blockquote` nodes. Reads the first paragraph's leading text; matches `^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*` (case-insensitive, GitHub semantics: marker must be the very first inline content).
- On match:
  - Strips the `[!TYPE]` marker (and the line break after it) from the first paragraph.
  - Sets the node's `data.hName = "div"` and `data.hProperties` to `{ className: ["markdown-alert", "markdown-alert-<type>"], "data-alert-type": "<type>", "data-source-line": <preserved> }`.
  - Prepends a title node rendered as `<p class="markdown-alert-title" data-alert-type="<type>">{label}</p>`. The icon is supplied by CSS (`::before` with `mask-image`), so the title element carries no SVG.
- On no match: the node is left as a normal `blockquote`.
- **Label resolution is injectable.** Plugin options accept `{ label?: (type) => string }`. Default resolver calls the singleton `i18next.t("markdownPreview.alerts.<type>")` — same pattern as `shared/ipc/errors.ts`, which already uses the singleton outside React. Injection keeps the plugin unit-testable without booting i18n.

### Sanitize schema changes (`pipeline.ts`)

Current schema only adds `data-source-line` to a set of anchor tags. Extend minimally:

- Allow on `div`: `["className", "markdown-alert", "markdown-alert-note", "markdown-alert-tip", "markdown-alert-important", "markdown-alert-warning", "markdown-alert-caution"]`, plus `"data-alert-type"` and `"data-source-line"`.
- Allow on `p`: `["className", "markdown-alert-title"]` and `"data-alert-type"` (in addition to its existing `data-source-line`).
- Everything `remark-gfm` core needs (`del`, `input[type=checkbox][disabled]`, `li.task-list-item`, `ul/ol.contains-task-list`, all `table*` tags) is **already** permitted by `rehype-sanitize`'s `defaultSchema` — verified, no change required.
- `svg`/`path` stay disallowed. Alert icons are pure CSS.

`rehype-sanitize` allows a className value only when it's in the allowlist for that tag, so adding the specific `markdown-alert*` strings both enables our classes and prevents arbitrary class injection.

### i18n

New group in `en.json`:

```json
"markdownPreview": {
  "alerts": {
    "note": "Note",
    "tip": "Tip",
    "important": "Important",
    "warning": "Warning",
    "caution": "Caution"
  }
}
```

Known limitation: `renderMarkdown` is memoized on `source` only (`MarkdownPreview` `useMemo([source])`), so a runtime language switch would not re-translate already-rendered alert titles until the source changes. English is the only shipped locale today (the picker comes later), so this is acceptable; the future fix is to add `i18n.language` to the memo deps. Noted, not solved here.

### CSS / tokens

- **Task lists:** `ul.contains-task-list` / `li.task-list-item` lose the disc marker; checkbox vertically aligned with the first text line; nested task lists indent normally.
- **Tables:** keep existing borders; add GitHub-like zebra striping on even body rows and a slightly stronger header rule. Container scrolls horizontally on overflow (the existing `table { width: 100% }` stays).
- **Alerts:** one rule per type. Colored 3px left border + tinted icon + bold title via `--alert-*` tokens. Icon delivered with `mask-image: url("data:image/svg+xml,...")` (octicon path) + `background-color: currentColor` on the title `::before`, so it inherits the per-type color and needs no DOM SVG.
- **Tokens (`tokens.css`):** add `--alert-note`, `--alert-tip`, `--alert-important`, `--alert-warning`, `--alert-caution` (border/icon hue) for both light and dark roots, sourced from GitHub's alert palette and adapted to the app's HSL token style.

---

## Data flow

`renderMarkdown(source)` stays a pure `string -> string` (sanitized HTML) function. `MarkdownPreview` keeps injecting it via `dangerouslySetInnerHTML`. No new IPC, state, or React components. The only new runtime coupling is the alert plugin reading the `i18next` singleton for labels at render time.

## Error handling / edge cases

- A blockquote whose first line is `[!BOGUS]` or `[!NOTE]` not at the start → treated as a normal blockquote (no match), renders as a quote.
- Empty alert (`> [!NOTE]` with no body) → renders the titled callout with an empty body.
- Nested blockquotes / alert inside a list → transform still applies to the matched blockquote node; `data-source-line` preserved from that node.
- Malformed tables (ragged rows) → handled by `remark-gfm` per GFM spec; no extra handling.
- Sanitization: a `<script>` or disallowed attribute inside any construct is stripped by `rehype-sanitize` as before.

## Testing strategy

`bun test`, pure-function level (no DOM needed):

- **`remarkGithubAlerts.test.ts`** — each of the 5 types produces the `div.markdown-alert-<type>` with `data-alert-type` and an injected title label; the `[!TYPE]` marker is stripped from the body; a non-matching blockquote is left as `blockquote`; `data-source-line` is preserved onto the alert div.
- **`pipeline.test.ts`** — `renderMarkdown()` output contains: a `<table>` with header/body, task-list `<input type="checkbox" disabled>` (checked and unchecked), `<del>` for `~~x~~`, an autolinked `<a href>`, and each alert callout. Sanitization asserts: `<script>` removed, alert classes/`data-alert-type` preserved, `data-source-line` preserved, and that an arbitrary class on a `div` is dropped while `markdown-alert` survives.

Manual check against the Phase 7 acceptance checklist tracking issue is out of scope for this PR but the constructs map to its "renders GFM" line.

## Rollout

Single PR on `feat/phase-5-gfm`. CI must pass `bun run check`, `bun run typecheck`, `bun run build:web`, and `bun test`. Closes #26.

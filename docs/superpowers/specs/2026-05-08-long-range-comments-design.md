# Long-range comments (10–15+ lines) — design spec

**Issue:** [#24 — Long range comments (10–15+ lines)](https://github.com/jaovito/markdown-reviewer/issues/24)
**Milestone:** Phase 4 — Advanced Comments
**Status:** Design approved 2026-05-08; ready for implementation plan.

---

## Goal

Make multi-line review comments (especially 10+ line anchors) feel calm and traceable in the rendered Markdown preview, and let reviewers identify each thread in the threads pane without having to open the file. Closes the last open Phase 4 issue.

The mechanical anchor model already supports arbitrary range lengths (`lineRange` and `codeBlock` anchors carry `startLine` / `endLine`). This spec is purely UX polish on top of that model:

1. Replace the per-line full-background wash on multi-line ranges with a thin left rail plus a sticky header chip pinned to the start of the range.
2. Add a source-snippet preview to every row in the threads pane.

No Rust changes. No DB migration. No new IPC commands.

---

## Non-goals

- Capping range length. There is no hard upper bound; the visual treatment scales gracefully.
- Cross-file source diffing — the snippet shows raw Markdown source, not a rendered or diff-aware preview.
- Syntax highlighting in the threads-pane snippet (code-block anchors render as plain mono text).
- Pre-fetching every Markdown file in the PR up front.

---

## 1. Inline long-range layout (`features/comments`)

### Visual

| Anchor kind                   | Visual treatment                                                                                                                                                                       |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `singleLine`                  | Unchanged — full background wash + 3px brand left bar + 6px rounded corners (current `[data-source-line][data-has-comment="true"]` rule).                                              |
| `lineRange` / `codeBlock` (multi-line) | Drop the wash. Render a continuous **3px brand left rail** spanning every covered line (rounded top on the start line, rounded bottom on the end line, straight middle). Add a **sticky range header chip** above the start line: `"L{start}–L{end} · {count} comment"` + a "Jump" affordance. |
| Resolved / hidden / minimized (multi-line) | Same rail, muted via the existing `data-comment-minimized` / `data-comment-resolved` attributes already stamped on each line. The wash-specific minimized/resolved CSS rules go away for ranges. |

### DOM contract

`syncSlots` in `InlineThreads.tsx` already walks every covered line. Extend it to:

1. Stamp a new attribute alongside `data-has-comment` on each line in the range:
   - `data-comment-range="head"` on `startLine`
   - `data-comment-range="tail"` on `endLine`
   - `data-comment-range="body"` on every line strictly between
   - `data-comment-range="single"` on a single-line anchor (lets the existing wash rule key off the same attribute uniformly)
2. Allocate a new slot type alongside the existing card / badge slots:

```ts
interface SlotMap {
  threads: Map<SlotKey, HTMLDivElement>;     // existing — card slot AFTER endLine
  badges: Map<SlotKey, HTMLSpanElement>;     // existing — collapsed-state badge
  headers: Map<SlotKey, HTMLDivElement>;     // NEW — range header BEFORE startLine
  composerSlot: HTMLDivElement | null;       // existing
}
```

`headers` slot is created only when `startLine !== endLine` and the group is not collapsed (a fully hidden / fully resolved-collapsed range shows no header — the gutter marker already handles those cases). Mounted as `data-thread-slot="header"` so the existing mutation observer's `mutationIsSignificant` check ignores it.

The header slot is inserted **before** the start-line node (`anchor.parentNode.insertBefore(slot, anchor)`), as a block-level sibling. The chip itself uses `position: sticky; top: 0; z-index: 1` inside the preview's scroll container.

### `RangeHeaderChip` component

New component at `src/features/comments/components/RangeHeaderChip.tsx`. Portaled into the header slot from `InlineThreads`.

Props:

```ts
interface RangeHeaderChipProps {
  startLine: number;
  endLine: number;
  count: number;
  /** Used to mute the rail color when the thread is resolved. */
  state: CommentState;
  onJump: () => void;
}
```

Behavior:
- Renders `t("comments.range.headerLabel", { start, end, count })` + a small ghost button labeled `t("comments.range.jump")` with `aria-label={t("comments.range.jumpAria")}`.
- `onJump` is wired up in `InlineThreads` to (a) `select(headComment.id)` and (b) call `scrollIntoView({ block: "center", behavior: "smooth" })` on the corresponding card slot DOM node looked up via `slotsRef.current.threads.get(slotKey)`.

### CSS changes

In `src/shared/styles/index.css`:
- Drop the `[data-source-line][data-has-comment="true"]` wash for multi-line ranges by guarding it with `[data-comment-range="single"]`.
- Add a new rail rule keyed off `[data-comment-range="head"|"body"|"tail"]` — 3px solid brand-color left border, rounded top on `head`, rounded bottom on `tail`, no rounding on `body`. Per-line `padding-left` matches the existing wash rule so vertical alignment stays consistent.
- Mirror the same in the `pre [data-code-line]` family for code-block anchors.
- Add a `[data-thread-slot="header"]` rule that gives the header slot `margin: 0 0 4px`, removes default block flow padding, and sets `position: sticky; top: 0` with the preview's background as the chip backdrop so text behind doesn't bleed through.
- Keep the resolved/hidden minimized rules but reduce them to opacity + rail color desaturation.

### Single-line behavior

`singleLine` anchors keep the wash. They get `data-comment-range="single"` so any future styling can branch off it; today's CSS keys off the new attribute but uses the legacy wash visual.

---

## 2. Threads-pane snippet preview (`features/main/components/threads`)

### `ThreadSnippet` component

New component at `src/features/main/components/threads/ThreadSnippet.tsx`. Mounted by `ThreadCard` between the anchor label row and the comment body, for every visible row regardless of anchor kind.

Props:

```ts
interface ThreadSnippetProps {
  prNumber: number;
  filePath: string;
  headSha: string;
  startLine: number;
  endLine: number;
}
```

Layout:
- Outer wrapper: `font-mono text-[11px] leading-snug rounded border-l-[1.5px] border-[hsl(var(--comment-marker-fg))] pl-2 py-1 my-1 bg-[hsl(var(--muted))]/30`.
- Inner: a list of up to **3 source lines** (`MAX_VISIBLE = 3`), trailing line ellipsised via `text-overflow: ellipsis` on the last child. `white-space: pre`.
- If the range is longer than `MAX_VISIBLE`, a muted row beneath: `t("threads.snippet.moreLines", { count })` (with `_one` / `_other` plurals).
- While loading, render a `Skeleton` block with the same height (~3 lines × line-height).
- On error, render `null` — the rest of the card still works.

Slicing rule (single source of truth in a helper):

```ts
function sliceSnippet(
  lines: string[],
  startLine: number,
  endLine: number,
  maxVisible = 3,
): { visible: string[]; more: number } {
  const total = endLine - startLine + 1;
  const stop = startLine - 1 + Math.min(total, maxVisible);
  const visible = lines.slice(startLine - 1, stop);
  const more = Math.max(0, total - visible.length);
  return { visible, more };
}
```

### `useFileSource` hook

New hook at `src/features/comments/hooks/useFileSource.ts` (lives under `comments` because both inline and pane consumers belong to comment surfaces; the hook itself is feature-agnostic at runtime).

```ts
export function useFileSource(
  repoPath: string | undefined,
  sha: string | undefined,
  filePath: string,
): { lines: string[] | null; isLoading: boolean; error: AppError | null };
```

Implementation:
- Wraps `useQuery` with key `["file-source", repoPath, sha, filePath]`.
- `queryFn` calls `ipc.files.readMarkdown(repoPath, sha, filePath)` (the existing Phase 2 command at `read_markdown_file`). On `Result.ok === false`, throws so React Query surfaces the error.
- `enabled: Boolean(repoPath && sha && filePath)` — when any input is missing, the query stays idle and the hook returns `{ lines: null, isLoading: false, error: null }`.
- `staleTime: Infinity`, `gcTime: 5 * 60_000`. Markdown source is content-addressable for a given `(repoPath, sha)`; the `sha` segment of the key auto-invalidates when the PR is refreshed.
- Returns `{ lines: data.split("\n"), isLoading, error }`. The `split` is memoized inside the hook via a `useMemo` keyed on `data` so multiple `ThreadSnippet` instances reading the same file share the same `string[]` reference.

### `ThreadCard` integration

`ThreadCard.tsx` mounts `<ThreadSnippet />` between the anchor label row and the comment-body row, passing the head comment's `(startLine, endLine)`. `ThreadCard` already receives `filePath` (via the `ThreadGroup`); `repoPath` and `sha` are not in the threads-pane subtree today — they live in `PullRequestScreen` (`repoPath.data` and `detail.data?.headSha`). Plumbing chain to add:

```
PullRequestScreen (has repoPath + headSha)
  → ThreadsPane (add repoPath + headSha props)
    → ThreadList (add repoPath + headSha props)
      → ThreadCard (consume + pass to ThreadSnippet)
        → ThreadSnippet → useFileSource(repoPath, sha, filePath)
```

`ThreadFileGroup` and `ThreadAnchorGroup` don't need the new props — they only render headers and forward `children`. The chain skips them. Each remaining layer adds a couple of optional props (typed as `string | undefined`). No new context or store.

When `head.anchor.kind === "singleLine"`, both `startLine` and `endLine` equal the same line number — the snippet renders a single line with no "more" suffix.

---

## 3. Backend / IPC

No new commands. No DTO additions. No SQLite migration.

`src/shared/ipc/contract.ts` — unchanged.

The frontend side reuses `read_markdown_file(path)` which returns `string` (already typed). All processing happens in `useFileSource`.

---

## 4. State, stores, i18n

### Stores

No new stores. Existing `useSelectedThread`, `useMinimizedThreads`, `useThreadsFilter` are unchanged.

### i18n keys (`src/shared/i18n/locales/en.json`)

Repo is currently English-only; add keys in English. New keys, grouped by feature:

```jsonc
{
  "comments": {
    "range": {
      "headerLabel_one": "L{{start}}–L{{end}} · {{count}} comment",
      "headerLabel_other": "L{{start}}–L{{end}} · {{count}} comments",
      "jump": "Jump",
      "jumpAria": "Jump to comment thread"
    }
  },
  "threads": {
    "snippet": {
      "moreLines_one": "… +{{count}} more line",
      "moreLines_other": "… +{{count}} more lines"
    }
  }
}
```

(Spec presented to the user in pt-BR for review; ship strings remain English.)

### Tokens

Add nothing new today — the rail reuses `--comment-marker-fg`, the snippet background reuses `--muted`. If dark-mode contrast on the rail proves insufficient during smoke testing, add `--comment-rail-fg` token in a follow-up commit.

---

## 5. Tests

### Unit (Bun)

- `src/features/main/components/threads/ThreadSnippet.test.ts` — pure-function test for `sliceSnippet`:
  - 15-line range with `maxVisible = 3` → 3 visible, 12 more.
  - 2-line range with `maxVisible = 3` → 2 visible, 0 more.
  - single-line (`startLine === endLine`) → 1 visible, 0 more.

### Component (Bun + happy-dom)

- `RangeHeaderChip.test.tsx`
  - Renders the localized label with start/end/count.
  - Clicking "Jump" calls `onJump` exactly once.
  - `aria-label` resolves through i18n.
- `ThreadSnippet.test.tsx`
  - Mocks `useFileSource` to return canned lines + headSha.
  - 3-line range renders three `<pre>`-style rows and no "more" row.
  - 15-line range renders three rows + the "+12 more lines" row.
  - Loading state renders `Skeleton`.
  - Error state renders `null`.

### Manual smoke (Tauri dev)

Run `bun run dev` against the local fixture PR:

1. Drag-select a 15-line range across paragraphs and code blocks. Expect:
   - Continuous left rail across all 15 covered lines (rounded top/bottom).
   - Header chip pinned at the top with `L{start}–L{end} · 1 comment · Jump`.
   - Card slot below the last covered line.
2. Scroll past the chip into the middle of the range. The chip should stick to the top of the preview while the rail keeps highlighting the surrounding lines.
3. Click "Jump" on the chip. Smooth-scroll lands on the card with the head comment selected.
4. Open the threads pane. Expect:
   - Each row shows a 3-line monospace snippet from the source.
   - Threads in unloaded files show a brief Skeleton flash, then snap to content.
   - Range threads longer than 3 lines show "… +N more lines".
5. Resolve a long-range thread. Expect:
   - Inline rail desaturates; the gutter marker takes over (existing behavior).
   - Pane snippet stays visible for traceability.

---

## 6. Files touched (estimate)

```
src/features/comments/components/InlineThreads.tsx          ~+80 lines (header slot, range data attrs)
src/features/comments/components/RangeHeaderChip.tsx        new (~60 lines)
src/features/comments/hooks/useFileSource.ts                new (~40 lines)
src/features/main/components/threads/ThreadCard.tsx         ~+15 lines (mount ThreadSnippet, accept repoPath/sha props)
src/features/main/components/threads/ThreadList.tsx         ~+5 lines (accept + forward repoPath/sha)
src/features/main/components/ThreadsPane.tsx                ~+5 lines (accept repoPath/sha props)
src/features/file-explorer/screens/PullRequestScreen/index.tsx  ~+2 lines (pass repoPath + headSha to ThreadsPane)
src/features/main/components/threads/ThreadSnippet.tsx      new (~80 lines)
src/shared/styles/index.css                                 ~+30 lines (rail variants, sticky header)
src/shared/i18n/locales/en.json                             ~+6 keys
+ 3 test files
```

No Rust changes. No new shadcn primitives. No DB migration.

---

## Open questions

None at design time. If dark-mode contrast on the rail proves insufficient during smoke testing, introduce `--comment-rail-fg` as a follow-up.

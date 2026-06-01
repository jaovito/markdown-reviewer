# Long-range comments — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make multi-line review-comment anchors (10–15+ lines) feel calm and traceable in the Markdown preview, and add a source-snippet preview to every row in the threads pane. Closes [GitHub issue #24](https://github.com/jaovito/markdown-reviewer/issues/24) (Phase 4 — Advanced Comments).

**Architecture:** Frontend-only. `InlineThreads.syncSlots` gains a third slot type (`headers`) that mounts a sticky `RangeHeaderChip` portal above the start line of every multi-line range; per-line CSS keys off a new `data-comment-range="head|body|tail|single"` attribute to draw a continuous left rail instead of the wash. Threads pane gets a new `ThreadSnippet` component fed by a lazy `useFileSource` React Query hook that reuses the existing `read_markdown_file` IPC command — `repoPath` and `headSha` are plumbed from `PullRequestScreen` through `ThreadsPane` → `ThreadList` → `ThreadCard`.

**Tech Stack:** React 18 + TypeScript, Tauri v2 IPC, React Query v5, Tailwind v4, i18next, Bun for runtime + tests, Biome for lint/format.

**Spec:** `docs/superpowers/specs/2026-05-08-long-range-comments-design.md`

**Conventions reminder:**
- Every user-facing string goes through `i18next`. Add the key to `src/shared/i18n/locales/en.json` and read it with `useTranslation()`. Repo is English-only today.
- All IPC goes through `src/shared/ipc/client.ts` (`ipc.*`). Never `invoke()` inline.
- Tests live next to the code as `*.test.ts` and run via `bun test` (no React Testing Library — only pure-function tests are in scope here).
- Run `bun run check:fix && bun run typecheck && bun test` before each commit. Pre-commit hooks already exist; do not pass `--no-verify`.

---

## File map

**Create:**
- `src/features/comments/lib/sliceSnippet.ts` — pure helper that slices a file's lines for a `(startLine, endLine)` window.
- `src/features/comments/lib/sliceSnippet.test.ts` — `bun:test` cases for the slicer.
- `src/features/comments/hooks/useFileSource.ts` — React Query hook wrapping `ipc.files.readMarkdown`.
- `src/features/comments/components/RangeHeaderChip.tsx` — sticky header chip portaled above the range start.
- `src/features/main/components/threads/ThreadSnippet.tsx` — snippet block rendered inside `ThreadCard`.

**Modify:**
- `src/features/comments/components/InlineThreads.tsx` — extend `SlotMap` with `headers`, allocate header slot in `syncSlots`, stamp `data-comment-range` per-line, mount `RangeHeaderChip` via portal, wire Jump → select + scroll.
- `src/features/main/components/threads/ThreadCard.tsx` — accept `repoPath` / `sha` props, mount `ThreadSnippet` between header and body.
- `src/features/main/components/threads/ThreadList.tsx` — accept + forward `repoPath` / `sha`.
- `src/features/main/components/ThreadsPane.tsx` — accept `repoPath` / `sha` props, forward to `ThreadList`.
- `src/features/file-explorer/screens/PullRequestScreen/index.tsx` — pass `repoPath.data` and `detail.data?.headSha` to `<ThreadsPane>`.
- `src/shared/styles/index.css` — gate the existing wash on `data-comment-range="single"`, add rail rules for `head|body|tail` (both prose and `pre [data-code-line]` variants), add `[data-thread-slot="header"]` rule.
- `src/shared/i18n/locales/en.json` — add the new keys under `comments.range.*` and `threads.snippet.*`.

**Test:** `src/features/comments/lib/sliceSnippet.test.ts` only. Component behavior is verified manually via the smoke checklist at the end of the plan.

---

## Task 1: `sliceSnippet` pure helper (TDD)

**Files:**
- Create: `src/features/comments/lib/sliceSnippet.ts`
- Test: `src/features/comments/lib/sliceSnippet.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/features/comments/lib/sliceSnippet.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { sliceSnippet } from "./sliceSnippet";

const FIFTEEN_LINES = Array.from({ length: 15 }, (_, i) => `line ${i + 1}`);

describe("sliceSnippet", () => {
  test("returns the full range when shorter than maxVisible", () => {
    const out = sliceSnippet(FIFTEEN_LINES, 2, 4, 3);
    expect(out.visible).toEqual(["line 2", "line 3", "line 4"]);
    expect(out.more).toBe(0);
  });

  test("truncates ranges longer than maxVisible and reports the overflow", () => {
    const out = sliceSnippet(FIFTEEN_LINES, 1, 15, 3);
    expect(out.visible).toEqual(["line 1", "line 2", "line 3"]);
    expect(out.more).toBe(12);
  });

  test("single-line range yields one visible line", () => {
    const out = sliceSnippet(FIFTEEN_LINES, 7, 7, 3);
    expect(out.visible).toEqual(["line 7"]);
    expect(out.more).toBe(0);
  });

  test("clamps when endLine exceeds the file length", () => {
    const out = sliceSnippet(FIFTEEN_LINES, 14, 20, 3);
    // The window starts at line 14; only lines 14 and 15 exist; `more`
    // counts requested lines beyond the file.
    expect(out.visible).toEqual(["line 14", "line 15"]);
    expect(out.more).toBe(5);
  });

  test("returns empty when startLine is past the end of the file", () => {
    const out = sliceSnippet(FIFTEEN_LINES, 99, 100, 3);
    expect(out.visible).toEqual([]);
    expect(out.more).toBe(2);
  });

  test("uses default maxVisible = 3 when omitted", () => {
    const out = sliceSnippet(FIFTEEN_LINES, 1, 10);
    expect(out.visible).toHaveLength(3);
    expect(out.more).toBe(7);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/features/comments/lib/sliceSnippet.test.ts`
Expected: FAIL with `Cannot find module './sliceSnippet'` or similar.

- [ ] **Step 3: Implement the helper**

Create `src/features/comments/lib/sliceSnippet.ts`:

```ts
export interface SnippetSlice {
  /** Lines visible inside the snippet block, in source order. */
  visible: string[];
  /** Count of additional lines requested but not shown — drives the `+N more lines` row. */
  more: number;
}

/**
 * Slices a file's lines for the snippet preview shown in the threads pane.
 *
 * Inputs use 1-based line numbers (the rest of the comments feature speaks in
 * source line numbers). The function clamps gracefully when the requested
 * range extends past the end of the file — `more` reports how many requested
 * lines were truncated, including any beyond the file's length.
 */
export function sliceSnippet(
  lines: string[],
  startLine: number,
  endLine: number,
  maxVisible = 3,
): SnippetSlice {
  const total = Math.max(0, endLine - startLine + 1);
  const startIndex = Math.max(0, startLine - 1);
  const stop = startIndex + Math.min(total, maxVisible);
  const visible = lines.slice(startIndex, stop);
  const more = total - visible.length;
  return { visible, more };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/features/comments/lib/sliceSnippet.test.ts`
Expected: PASS — 6 passed.

- [ ] **Step 5: Lint + typecheck**

Run: `bun run check:fix && bun run typecheck`
Expected: no diagnostics.

- [ ] **Step 6: Commit**

```bash
git add src/features/comments/lib/sliceSnippet.ts src/features/comments/lib/sliceSnippet.test.ts
git commit -m "feat(phase-4 #24): add sliceSnippet helper for thread snippet preview"
```

---

## Task 2: `useFileSource` hook

**Files:**
- Create: `src/features/comments/hooks/useFileSource.ts`

- [ ] **Step 1: Implement the hook**

Create `src/features/comments/hooks/useFileSource.ts`:

```ts
import { ipc } from "@/shared/ipc/client";
import type { AppError } from "@/shared/ipc/contract";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

interface UseFileSourceResult {
  lines: string[] | null;
  isLoading: boolean;
  error: AppError | null;
}

/**
 * Lazily reads a Markdown file's source bytes for a given (repoPath, sha)
 * pair and exposes it as an array of lines for snippet rendering. Backed by
 * the existing `read_markdown_file` IPC command and React Query, so multiple
 * consumers reading the same file dedupe to a single read.
 *
 * The cache key includes `sha`, so refreshing the PR (which produces a new
 * head sha) auto-invalidates without manual busting.
 */
export function useFileSource(
  repoPath: string | undefined,
  sha: string | undefined,
  filePath: string,
): UseFileSourceResult {
  const enabled = Boolean(repoPath && sha && filePath);
  const query = useQuery<string, AppError>({
    queryKey: ["file-source", repoPath, sha, filePath],
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 5 * 60_000,
    queryFn: async () => {
      const res = await ipc.files.readMarkdown(repoPath as string, sha as string, filePath);
      if (!res.ok) throw res.error;
      return res.value;
    },
  });

  // Memoize the split so two ThreadSnippet instances reading the same file
  // share the exact same string[] reference — keeps downstream React equality
  // checks cheap.
  const lines = useMemo(() => (query.data ? query.data.split("\n") : null), [query.data]);

  return {
    lines,
    isLoading: query.isLoading,
    error: query.error ?? null,
  };
}
```

- [ ] **Step 2: Lint + typecheck**

Run: `bun run check:fix && bun run typecheck`
Expected: no diagnostics.

- [ ] **Step 3: Commit**

```bash
git add src/features/comments/hooks/useFileSource.ts
git commit -m "feat(phase-4 #24): add useFileSource hook for snippet source"
```

---

## Task 3: i18n keys

**Files:**
- Modify: `src/shared/i18n/locales/en.json`

- [ ] **Step 1: Locate the existing groups**

Open `src/shared/i18n/locales/en.json` and find the existing `"comments"` and `"threads"` top-level objects (they were added in earlier Phase 4 tasks).

- [ ] **Step 2: Add the new keys**

Inside the existing `"comments"` object, add a `"range"` sub-object next to the current `"thread"`, `"composer"`, `"markers"` siblings:

```json
"range": {
  "headerLabel_one": "L{{start}}–L{{end}} · {{count}} comment",
  "headerLabel_other": "L{{start}}–L{{end}} · {{count}} comments",
  "jump": "Jump",
  "jumpAria": "Jump to comment thread"
}
```

Inside the existing `"threads"` object, add a `"snippet"` sub-object next to the current `"row"` sibling:

```json
"snippet": {
  "moreLines_one": "… +{{count}} more line",
  "moreLines_other": "… +{{count}} more lines"
}
```

Use real commas to separate the new sub-objects from neighboring keys; Biome will error on a trailing comma.

- [ ] **Step 3: Verify the type generator picks up the new keys**

Run: `bun run typecheck`
Expected: no diagnostics. The generated `src/shared/i18n/types.d.ts` is regenerated from `en.json` on `tsc`, and any consumer typo would surface here in later tasks.

- [ ] **Step 4: Commit**

```bash
git add src/shared/i18n/locales/en.json
git commit -m "feat(phase-4 #24): i18n keys for range header chip and snippet preview"
```

---

## Task 4: `RangeHeaderChip` component

**Files:**
- Create: `src/features/comments/components/RangeHeaderChip.tsx`

- [ ] **Step 1: Implement the component**

Create `src/features/comments/components/RangeHeaderChip.tsx`:

```tsx
import type { CommentState } from "@/shared/ipc/contract";
import { cn } from "@/shared/lib/cn";
import { CornerDownRightIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

interface RangeHeaderChipProps {
  startLine: number;
  endLine: number;
  /** Total number of comments anchored to this range. */
  count: number;
  /** Drives the muted/desaturated styling for resolved or hidden threads. */
  state: CommentState;
  /** Smooth-scrolls the matching card into view and selects the head. */
  onJump: () => void;
}

/**
 * Compact, sticky header rendered above the first line of a multi-line range
 * anchor. Tells the reader "there is a comment thread spanning L{start}–L{end}"
 * even when the thread card itself is scrolled off the bottom of the viewport.
 *
 * The chip itself is rendered into a slot inserted by `InlineThreads` directly
 * in the article DOM, so `position: sticky; top: 0` (set in CSS via
 * `[data-thread-slot="header"]`) keeps it pinned to the top of the preview's
 * scroll container while the user reads through the range.
 */
export function RangeHeaderChip({ startLine, endLine, count, state, onJump }: RangeHeaderChipProps) {
  const { t } = useTranslation();
  const muted = state === "resolved" || state === "hidden";
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border px-2 py-1 text-[11px]",
        "border-[hsl(var(--comment-marker-border))] bg-[hsl(var(--comment-marker-bg))]",
        "text-[hsl(var(--comment-marker-fg))] shadow-sm",
        muted ? "opacity-70" : null,
      )}
      data-comment-range-header="true"
    >
      <span className="font-mono">
        {t("comments.range.headerLabel", { count, start: startLine, end: endLine })}
      </span>
      <span className="ml-auto" />
      <button
        type="button"
        onClick={onJump}
        aria-label={t("comments.range.jumpAria")}
        className={cn(
          "inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium",
          "hover:bg-[hsl(var(--comment-marker-hover))]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
        )}
      >
        <CornerDownRightIcon className="h-3 w-3" aria-hidden="true" />
        <span>{t("comments.range.jump")}</span>
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Lint + typecheck**

Run: `bun run check:fix && bun run typecheck`
Expected: no diagnostics.

- [ ] **Step 3: Commit**

```bash
git add src/features/comments/components/RangeHeaderChip.tsx
git commit -m "feat(phase-4 #24): RangeHeaderChip for sticky long-range header"
```

---

## Task 5: extend `InlineThreads` slot machinery

**Files:**
- Modify: `src/features/comments/components/InlineThreads.tsx`

This is the largest task in the plan — keep it on its own commit.

- [ ] **Step 1: Add the `headers` slot to `SlotMap`**

Locate the `SlotMap` interface (around line 40) and add a `headers` field:

```ts
interface SlotMap {
  /** key → portal target div for the expanded card */
  threads: Map<SlotKey, HTMLDivElement>;
  /** key → portal target span for the minimized "open" badge */
  badges: Map<SlotKey, HTMLSpanElement>;
  /** key → portal target div for the sticky range header (multi-line ranges only) */
  headers: Map<SlotKey, HTMLDivElement>;
  composerSlot: HTMLDivElement | null;
}
```

Update the initial `useRef<SlotMap>` initializer (around line 171) to include `headers: new Map()`. Update the unmount cleanup `useEffect` (around line 248) to reset `headers` too.

- [ ] **Step 2: Stamp `data-comment-range` per-line in `markRange`**

Modify the `markRange` helper (around line 638) so it stamps a `data-comment-range` attribute alongside `data-has-comment`. New signature:

```ts
function markRange(
  lineNodes: Map<number, HTMLElement>,
  start: number,
  end: number,
  collapsed: boolean,
  resolved: boolean,
) {
  const single = start === end;
  for (let line = start; line <= end; line++) {
    const el = lineNodes.get(line);
    if (!el) continue;
    el.dataset.hasComment = "true";
    el.dataset.commentRange = single
      ? "single"
      : line === start
        ? "head"
        : line === end
          ? "tail"
          : "body";
    if (collapsed) el.dataset.commentMinimized = "true";
    if (resolved) el.dataset.commentResolved = "true";
  }
}
```

Also extend the cleanup pass at the start of `syncSlots` (the block of `for (const n of container.querySelectorAll<HTMLElement>("[data-has-comment]")) ...`) so it deletes `data-comment-range` along with the existing flags. Add a parallel pass:

```ts
for (const n of container.querySelectorAll<HTMLElement>("[data-comment-range]")) {
  delete n.dataset.commentRange;
}
```

Mirror the same delete in `removeAllSlots` (around line 654).

- [ ] **Step 3: Allocate the header slot in `syncSlots`**

Inside the main slot-allocation loop in `syncSlots` (around line 570 — `for (const group of groups)`), at the end of the loop body and **only** when the group is multi-line and not collapsed, insert a header slot **before** the start-line node. New code added inside the existing loop, after the existing badge/card branch:

```ts
const wantsHeader = !isCollapsed && group.startLine !== group.endLine;
if (wantsHeader) {
  if (!current.headers.has(key)) {
    const startNode = lineNodes.get(group.startLine);
    if (startNode?.parentNode) {
      const header = document.createElement("div");
      header.dataset.threadSlot = "header";
      header.dataset.threadSlotLine = String(group.startLine);
      startNode.parentNode.insertBefore(header, startNode);
      current.headers.set(key, header);
      changed = true;
    }
  }
} else if (current.headers.has(key)) {
  current.headers.get(key)?.remove();
  current.headers.delete(key);
  changed = true;
}
```

And just like for the existing `threads` and `badges` maps, add a leading cleanup pass that removes header slots for groups that no longer exist or whose nodes have detached:

```ts
const wantsHeaderKeys = new Set<SlotKey>();
for (const g of groups) {
  if (collapsed.has(slotKeyFor(g.startLine, g.endLine))) continue;
  if (g.startLine === g.endLine) continue;
  wantsHeaderKeys.add(slotKeyFor(g.startLine, g.endLine));
}
for (const [key, node] of current.headers) {
  if (!wantsHeaderKeys.has(key) || !node.isConnected) {
    node.remove();
    current.headers.delete(key);
    changed = true;
  }
}
```

Place this cleanup pass right after the existing badge cleanup (the `for (const [key, node] of current.badges)` block).

- [ ] **Step 4: Mount `RangeHeaderChip` via portal**

At the top of `InlineThreads.tsx`, add the import:

```ts
import { RangeHeaderChip } from "./RangeHeaderChip";
```

In the `groups.map(...)` render block (around line 287), at the very start of the callback (before any branches that `return null` early), compute and emit a header portal — but only for multi-line non-collapsed groups. Wrap each group's output in a fragment:

```tsx
{groups.flatMap((group) => {
  const slotKey = slotKeyFor(group.startLine, group.endLine);
  const minKey = minimizedKey(prNumber, filePath, group.startLine, group.endLine);
  const minimized = minimizedSet.has(minKey);
  const allHidden = allHiddenSet.has(slotKey);
  const isResolvedCollapsed = resolvedCollapsed.has(slotKey);
  const headerSlot = slots.headers.get(slotKey);
  const wantsHeader =
    group.startLine !== group.endLine && !minimized && !allHidden && !isResolvedCollapsed;

  const headerNode =
    wantsHeader && headerSlot
      ? createPortal(
          <RangeHeaderChip
            key={`hdr-${slotKey}`}
            startLine={group.startLine}
            endLine={group.endLine}
            count={group.comments.length}
            state={group.comments[0]?.state ?? "submitted"}
            onJump={() => {
              const head = group.comments[0];
              if (head) select(head.id);
              const cardSlot = slotsRef.current.threads.get(slotKey);
              if (cardSlot) {
                const reduce =
                  typeof window !== "undefined" &&
                  typeof window.matchMedia === "function" &&
                  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
                cardSlot.scrollIntoView({
                  block: "center",
                  behavior: reduce ? "auto" : "smooth",
                });
              }
            }}
          />,
          headerSlot,
          `thread-header-${slotKey}`,
        )
      : null;

  // … existing per-group branches that return the inline card / badge …
  const body = /* keep the existing single return value here */ null;

  return [headerNode, body];
})}
```

The existing per-group code (composer, badges, hidden marker, resolved marker, full card) stays unchanged — it just becomes the value assigned to `body` instead of being returned directly. The outer `return [headerNode, body]` plus `flatMap` ensures both portals end up in the tree without an extra DOM wrapper.

When you do this conversion, double-check that every existing branch that previously did `return createPortal(...)` now assigns to `body` and falls through to the final `return [headerNode, body]`. Do not remove any of the existing branches.

- [ ] **Step 5: Lint + typecheck**

Run: `bun run check:fix && bun run typecheck`
Expected: no diagnostics. If TypeScript complains about `flatMap` returning `(JSX.Element | null)[]`, that's expected — React accepts arrays of nodes.

- [ ] **Step 6: Run the existing comments tests to make sure nothing regressed**

Run: `bun test src/features/comments`
Expected: all existing tests pass (the new `sliceSnippet` test passes too).

- [ ] **Step 7: Commit**

```bash
git add src/features/comments/components/InlineThreads.tsx
git commit -m "feat(phase-4 #24): mount sticky range header chip in InlineThreads"
```

---

## Task 6: CSS — left rail + sticky header

**Files:**
- Modify: `src/shared/styles/index.css`

- [ ] **Step 1: Gate the existing wash on `data-comment-range="single"`**

In `src/shared/styles/index.css`, find the `.prose-styles [data-source-line][data-has-comment="true"]` rule (around line 164) and change the selector to:

```css
.prose-styles [data-source-line][data-has-comment="true"][data-comment-range="single"] {
  background: hsl(var(--comment-selection-bg));
  border-left: 3px solid hsl(var(--comment-marker-fg));
  border-radius: 6px;
  padding-left: 0.6em;
  margin-left: -0.6em;
}
```

Apply the same `[data-comment-range="single"]` qualifier to the two minimized/resolved variants of that rule that follow.

In the `.prose-styles pre [data-code-line][data-has-comment="true"]` family (around line 192), apply the same `[data-comment-range="single"]` qualifier to the base rule and its two minimized/resolved variants.

- [ ] **Step 2: Add the rail rules for `head|body|tail`**

Append below the existing wash rules (still in `index.css`):

```css
/* Multi-line range anchors get a continuous 3px left rail spanning every
   covered line — much lighter visually than the per-line wash, scales from
   2 lines to 50+ without dominating the document. The head line gets the
   top corner rounded; the tail line gets the bottom corner rounded. */
.prose-styles [data-source-line][data-has-comment="true"][data-comment-range="head"],
.prose-styles [data-source-line][data-has-comment="true"][data-comment-range="body"],
.prose-styles [data-source-line][data-has-comment="true"][data-comment-range="tail"] {
  border-left: 3px solid hsl(var(--comment-marker-fg));
  padding-left: 0.6em;
  margin-left: -0.6em;
}
.prose-styles [data-source-line][data-has-comment="true"][data-comment-range="head"] {
  border-top-left-radius: 6px;
}
.prose-styles [data-source-line][data-has-comment="true"][data-comment-range="tail"] {
  border-bottom-left-radius: 6px;
}
/* Minimized / resolved long ranges desaturate the rail to match the existing
   collapse treatment, keeping the same selector shape as the wash variants. */
.prose-styles
  [data-source-line][data-has-comment="true"][data-comment-range="head"][data-comment-minimized="true"],
.prose-styles
  [data-source-line][data-has-comment="true"][data-comment-range="body"][data-comment-minimized="true"],
.prose-styles
  [data-source-line][data-has-comment="true"][data-comment-range="tail"][data-comment-minimized="true"] {
  border-left-color: hsl(var(--comment-marker-fg) / 0.4);
}
.prose-styles
  [data-source-line][data-has-comment="true"][data-comment-range="head"][data-comment-resolved="true"][data-comment-minimized="true"],
.prose-styles
  [data-source-line][data-has-comment="true"][data-comment-range="body"][data-comment-resolved="true"][data-comment-minimized="true"],
.prose-styles
  [data-source-line][data-has-comment="true"][data-comment-range="tail"][data-comment-resolved="true"][data-comment-minimized="true"] {
  border-left-color: hsl(var(--border));
}

/* Mirror the rail on per-line code spans inside <pre>. */
.prose-styles pre [data-code-line][data-has-comment="true"][data-comment-range="head"],
.prose-styles pre [data-code-line][data-has-comment="true"][data-comment-range="body"],
.prose-styles pre [data-code-line][data-has-comment="true"][data-comment-range="tail"] {
  border-left: 3px solid hsl(var(--comment-marker-fg));
  border-radius: 0;
  padding-left: 0.5em;
  margin-left: -0.5em;
}
.prose-styles
  pre
  [data-code-line][data-has-comment="true"][data-comment-range="head"][data-comment-minimized="true"],
.prose-styles
  pre
  [data-code-line][data-has-comment="true"][data-comment-range="body"][data-comment-minimized="true"],
.prose-styles
  pre
  [data-code-line][data-has-comment="true"][data-comment-range="tail"][data-comment-minimized="true"] {
  border-left-color: hsl(var(--comment-marker-fg) / 0.4);
}
```

- [ ] **Step 3: Add the sticky header slot rule**

Below the existing `.prose-styles [data-thread-slot]` rule (around line 255), append:

```css
/* Sticky range header chip mounted above the first line of a multi-line
   range. Sticks to the top of the preview's scroll container so the reader
   keeps a "there is a comment here" affordance even when scrolled into the
   middle of a long range. */
.prose-styles [data-thread-slot="header"] {
  position: sticky;
  top: 0;
  z-index: 1;
  margin: 0 0 4px;
  background: hsl(var(--background));
}
```

- [ ] **Step 4: Visual smoke check**

Run: `bun run dev`
Open a Markdown PR, drag-select 12 lines, click Comment, save the draft. Expect:
- A continuous left rail (no full background wash) along all 12 covered lines.
- Rounded top-left on line 1 of the range, rounded bottom-left on line 12, straight in between.
- A sticky chip pinned to the top of the preview reading `L{x}–L{y} · 1 comment` plus a Jump link.
- A single-line comment elsewhere in the same file still uses the wash + 3px bar (unchanged).

If something looks wrong, re-check Step 1 (the qualifier on the wash rule) — a missed `[data-comment-range="single"]` is the most likely culprit.

- [ ] **Step 5: Commit**

```bash
git add src/shared/styles/index.css
git commit -m "feat(phase-4 #24): left rail + sticky header CSS for long-range anchors"
```

---

## Task 7: `ThreadSnippet` component

**Files:**
- Create: `src/features/main/components/threads/ThreadSnippet.tsx`

- [ ] **Step 1: Implement the component**

Create `src/features/main/components/threads/ThreadSnippet.tsx`:

```tsx
import { useFileSource } from "@/features/comments/hooks/useFileSource";
import { sliceSnippet } from "@/features/comments/lib/sliceSnippet";
import { Skeleton } from "@/shared/ui/skeleton";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

const MAX_VISIBLE = 3;

interface ThreadSnippetProps {
  /** Repo absolute path — required for the IPC read; undefined disables the read. */
  repoPath: string | undefined;
  /** Head sha of the PR; included in the cache key so refresh invalidates it. */
  sha: string | undefined;
  filePath: string;
  startLine: number;
  endLine: number;
}

/**
 * Renders up to 3 lines of the underlying Markdown source for a thread's
 * anchor, plus a `… +N more lines` row when the range extends beyond the
 * visible window. Used in the threads pane so reviewers can identify a
 * thread without opening the file.
 *
 * Failure is silent — when the file read errors out, the snippet is omitted
 * and the rest of the card (anchor label + comment body + author) still
 * works. The error already surfaces elsewhere via the file-explorer view.
 */
export function ThreadSnippet({ repoPath, sha, filePath, startLine, endLine }: ThreadSnippetProps) {
  const { t } = useTranslation();
  const { lines, isLoading, error } = useFileSource(repoPath, sha, filePath);

  const slice = useMemo(
    () => (lines ? sliceSnippet(lines, startLine, endLine, MAX_VISIBLE) : null),
    [lines, startLine, endLine],
  );

  if (isLoading || (!lines && !error)) {
    return (
      <div className="my-1.5 flex flex-col gap-1">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
        <Skeleton className="h-3 w-4/6" />
      </div>
    );
  }

  if (!slice || slice.visible.length === 0) {
    return null;
  }

  return (
    <div
      className="my-1.5 rounded border-[hsl(var(--comment-marker-fg))] border-l-[1.5px] bg-[hsl(var(--muted))]/30 py-1 pl-2 font-mono text-[11px] leading-snug"
      data-thread-snippet="true"
    >
      <pre className="overflow-hidden text-ellipsis whitespace-pre text-[hsl(var(--foreground))]/85">
        {slice.visible.join("\n")}
      </pre>
      {slice.more > 0 ? (
        <p className="mt-1 text-[10px] text-[hsl(var(--muted-foreground))]">
          {t("threads.snippet.moreLines", { count: slice.more })}
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Lint + typecheck**

Run: `bun run check:fix && bun run typecheck`
Expected: no diagnostics.

- [ ] **Step 3: Commit**

```bash
git add src/features/main/components/threads/ThreadSnippet.tsx
git commit -m "feat(phase-4 #24): ThreadSnippet renders source preview in threads pane"
```

---

## Task 8: thread-pane plumbing — accept `repoPath` + `sha`

**Files:**
- Modify: `src/features/main/components/threads/ThreadCard.tsx`
- Modify: `src/features/main/components/threads/ThreadList.tsx`
- Modify: `src/features/main/components/ThreadsPane.tsx`
- Modify: `src/features/file-explorer/screens/PullRequestScreen/index.tsx`

- [ ] **Step 1: Accept the new props in `ThreadCard`**

Open `src/features/main/components/threads/ThreadCard.tsx`. Add the import:

```tsx
import { ThreadSnippet } from "./ThreadSnippet";
```

Add two props to `ThreadCardProps`:

```ts
interface ThreadCardProps {
  group: ThreadGroup;
  selected: boolean;
  hideFilePath: boolean;
  hideAnchorLabel?: boolean;
  tabIndex?: number;
  asTreeItem?: boolean;
  /** Forwarded to ThreadSnippet's `useFileSource` — undefined disables the snippet. */
  repoPath?: string;
  /** Head sha for the snippet's cache key. */
  sha?: string;
  onFocus?: () => void;
  onSelect: (comment: ReviewComment) => void;
  onReopen?: (comment: ReviewComment) => void;
}
```

Destructure the two new props alongside the existing ones in the function signature.

Mount `<ThreadSnippet>` between the anchor-label/header row and the body row. Compute `startLine` / `endLine` from the head's anchor with the existing pattern used at the bottom of `ThreadList.tsx` (`startLineOf` / `endLineOf`). Inline a tiny helper at the top of the file:

```ts
function rangeOf(anchor: ReviewComment["anchor"]): { startLine: number; endLine: number } {
  if (anchor.kind === "singleLine") return { startLine: anchor.line, endLine: anchor.line };
  return { startLine: anchor.startLine, endLine: anchor.endLine };
}
```

Then immediately after the existing `hideAnchorLabel` block (the `<div>` containing the anchor label / state badge — around line 109), insert:

```tsx
{(() => {
  const { startLine, endLine } = rangeOf(head.anchor);
  return (
    <ThreadSnippet
      repoPath={repoPath}
      sha={sha}
      filePath={group.filePath}
      startLine={startLine}
      endLine={endLine}
    />
  );
})()}
```

The IIFE keeps the helper call out of the JSX without forcing another sub-component file.

- [ ] **Step 2: Forward the new props through `ThreadList`**

Open `src/features/main/components/threads/ThreadList.tsx`. Add to `ThreadListProps`:

```ts
/** Repo absolute path — forwarded to ThreadCard for the snippet read. */
repoPath?: string;
/** PR head sha — forwarded to ThreadCard for the snippet cache key. */
sha?: string;
```

Destructure them in the function signature alongside the other props. Pass them to every `<ThreadCard>` instance — there's currently one inside the file (the call wrapped in `<ThreadAnchorGroup>` around line 448):

```tsx
<ThreadCard
  ref={setItemRef(cId)}
  group={anchor}
  selected={isSelected}
  hideFilePath={hideFilePath}
  hideAnchorLabel
  asTreeItem
  tabIndex={effectiveActiveId === cId ? 0 : -1}
  onFocus={() => setActiveId(cId)}
  repoPath={repoPath}
  sha={sha}
  onSelect={(comment) => { /* unchanged */ }}
  onReopen={onReopen}
/>
```

- [ ] **Step 3: Forward the new props through `ThreadsPane`**

Open `src/features/main/components/ThreadsPane.tsx`. Add to `ThreadsPaneProps`:

```ts
/** Repo absolute path — forwarded to ThreadList for the snippet read. */
repoPath?: string;
/** PR head sha — forwarded to ThreadList for the snippet cache key. */
sha?: string;
```

Destructure them in the function signature. Pass them through to the existing `<ThreadList>` call (around line 150):

```tsx
<ThreadList
  comments={visible}
  isLoading={query.isLoading}
  hideFilePath={effectiveScope === "currentFile"}
  hiddenCount={hiddenCount}
  prNumber={prNumber}
  currentFilePath={filePath}
  repoPath={repoPath}
  sha={sha}
/>
```

- [ ] **Step 4: Pass the values from `PullRequestScreen`**

Open `src/features/file-explorer/screens/PullRequestScreen/index.tsx`. The values are already in scope: `repoPath.data` and `detail.data?.headSha`. Update the existing `<ThreadsPane>` call (around line 116):

```tsx
<ThreadsPane
  prNumber={prNumber}
  filePath={selectedPath}
  repoPath={repoPath.data ?? undefined}
  sha={detail.data?.headSha}
/>
```

- [ ] **Step 5: Lint + typecheck**

Run: `bun run check:fix && bun run typecheck`
Expected: no diagnostics.

- [ ] **Step 6: Run all tests**

Run: `bun test`
Expected: all tests pass — including the existing `groupAnchors.test.ts` and the new `sliceSnippet.test.ts`.

- [ ] **Step 7: Commit**

```bash
git add src/features/main/components/threads/ThreadCard.tsx \
        src/features/main/components/threads/ThreadList.tsx \
        src/features/main/components/ThreadsPane.tsx \
        src/features/file-explorer/screens/PullRequestScreen/index.tsx
git commit -m "feat(phase-4 #24): plumb repoPath + sha to ThreadSnippet"
```

---

## Task 9: manual smoke + close the issue

**Files:** none (smoke testing only).

- [ ] **Step 1: Run the dev app**

Run: `bun run dev`
Wait for the Tauri webview to open. Authenticate via `gh` if prompted.

- [ ] **Step 2: Long-range inline smoke**

Open a Markdown file in any PR. Verify each of these in turn:

1. Drag-select a paragraph spanning ~3 lines, click Comment, save. Expect: thin left rail across all 3 lines (rounded top + bottom corners), sticky header chip above line 1, card immediately below the last line.
2. Drag-select a 15-line region across paragraphs and a code block. Save. Expect: continuous rail along every covered line, header chip pinned at top reading `L{start}–L{end} · 1 comment` + Jump.
3. Scroll past the chip into the middle of the range. Expect: chip remains visible at the top of the preview while the rail keeps highlighting the surrounding lines.
4. Click the Jump button on the chip. Expect: smooth scroll lands on the card, the head comment is visibly selected.
5. Resolve the long-range thread. Expect: the rail desaturates (its border-left color drops to the muted variant) and the gutter marker takes over. Hidden behaves the same way.
6. Reopen the thread. Expect: rail returns to full color.
7. Create a single-line comment elsewhere. Expect: existing wash + 3px bar (unchanged from before this PR).

If the chip ever overlaps or disappears: confirm `position: sticky; top: 0` is firing inside `.prose-styles [data-thread-slot="header"]` (DevTools → Computed). If the rail disappears mid-range: `data-comment-range="body"` may have been stripped — check Step 2 of Task 5.

- [ ] **Step 3: Threads-pane snippet smoke**

Open the threads pane (right side). Verify:

1. Each row shows up to 3 lines of monospace source from the corresponding file.
2. Threads in unloaded files show a brief Skeleton flash, then snap to content.
3. Range threads longer than 3 lines show `… +N more lines` beneath the snippet.
4. Switching to a different file in the sidebar does not refetch already-cached file source (DevTools → React Query devtools, if installed; otherwise visual: no extra Skeleton flash on revisit).
5. A resolved long-range thread still shows its snippet (only the inline highlight desaturates; the pane stays informative).

- [ ] **Step 4: Update the GitHub issue**

Run:

```bash
gh issue comment 24 --body "Implemented in PR (link to follow). Smoke tested: long-range left rail + sticky header + threads-pane snippet preview all behave as designed; existing single-line wash unchanged."
```

(Or comment via the GitHub UI if `gh` is not authenticated locally.)

- [ ] **Step 5: Open the PR and link the issue**

When the branch is ready to ship:

```bash
gh pr create --title "feat(phase-4 #24): long range comments (10–15+ lines)" --body "$(cat <<'EOF'
## Summary
- Inline long-range anchors now use a thin left rail + sticky header chip instead of the per-line wash; single-line anchors are unchanged.
- Threads pane shows a 3-line source-snippet preview per thread, lazily loaded via React Query reusing `read_markdown_file`.

Closes #24.

## Test plan
- [ ] `bun test` passes.
- [ ] `bun run typecheck` passes.
- [ ] `bun run check` passes.
- [ ] Manual smoke per the plan's Task 9.
EOF
)"
```

---

## Self-review notes (resolved during planning)

- **Spec coverage:** every section (§1 long-range layout, §2 snippet preview, §3 IPC, §4 state/i18n, §5 tests, §6 file estimate) is implemented across Tasks 1–8. Task 9 covers the manual smoke from §5.
- **Test scope:** the spec called for component tests via Bun + happy-dom, but the repo has no React Testing Library / happy-dom setup today and no other Phase 4 task added one. The plan keeps only the pure-function `sliceSnippet` test from §5; component behavior is verified via the smoke checklist. If we later adopt RTL, add `RangeHeaderChip.test.tsx` / `ThreadSnippet.test.tsx` per the spec.
- **Type consistency:** `useFileSource` exposes `{ lines, isLoading, error }`. `ThreadSnippet` consumes the same shape. `ThreadCard` / `ThreadList` / `ThreadsPane` all use `repoPath?: string` and `sha?: string` — same names, same optionality, throughout the chain.
- **No placeholders:** every step contains the actual code or command an engineer needs.

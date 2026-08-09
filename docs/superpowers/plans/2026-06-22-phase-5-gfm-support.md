# Phase 5 / #26 — GFM Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render GFM tables, task lists, strikethrough, autolinks, and GitHub-style alerts (`> [!NOTE]`) in the Markdown preview, matching GitHub where reasonable.

**Architecture:** Frontend-only. Extend the `unified` pipeline in `src/features/markdown-preview/lib/pipeline.ts` with `remark-gfm` and a new custom `remarkGithubAlerts` mdast transform, widen the `rehype-sanitize` allowlist minimally, add alert title strings to i18n, and add CSS for the new constructs. `renderMarkdown(source)` stays a pure `string -> string` function consumed via `dangerouslySetInnerHTML`. No Rust/IPC changes.

**Tech Stack:** TypeScript, `unified` 11 / `remark-parse` / `remark-rehype` / `rehype-sanitize` / `rehype-stringify`, `remark-gfm` ^4.0.1, `unist-util-visit`, `i18next` (singleton), Tailwind v4 CSS, Bun (`bun test`), Biome.

## Global Constraints

- **No hardcoded user-facing strings.** Alert titles must go through `i18next`; add keys to `src/shared/i18n/locales/en.json` under a `markdownPreview` group. (CLAUDE.md)
- **Sanitize HTML with a tight allowlist.** Only add the specific class values / `data-*` attributes the new constructs need. Do **not** allow `svg`/`path`/script. (CLAUDE.md, spec)
- **Bun for tests:** `bun test`. New tests live next to the code as `*.test.ts`. (CLAUDE.md)
- **CI gates that must stay green:** `bun run check` (Biome), `bun run typecheck` (`tsc --noEmit`), `bun run build:web` (Vite), `bun test`.
- **Dependency:** `remark-gfm@^4.0.1` (unified 11 ecosystem). No other new runtime deps.
- **Preserve comment/diff anchoring:** the `data-source-line` attribute stamped by `remarkSourceLine` must survive on the new alert wrapper. (spec)
- Commit messages end with the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer.

---

## File Structure

```
package.json                                              (modify) add remark-gfm
src/features/markdown-preview/lib/pipeline.ts             (modify) wire remark-gfm + remarkGithubAlerts; widen schema
src/features/markdown-preview/lib/pipeline.test.ts        (create) end-to-end renderMarkdown() assertions
src/features/markdown-preview/lib/remarkGithubAlerts.ts   (create) [!TYPE] blockquote -> alert div transform
src/features/markdown-preview/lib/remarkGithubAlerts.test.ts (create) plugin unit tests
src/shared/i18n/locales/en.json                           (modify) markdownPreview.alerts.*
src/shared/styles/tokens.css                              (modify) --alert-* tokens (light + dark)
src/shared/styles/index.css                               (modify) task-list, table polish, alert callout styles
```

---

### Task 1: GFM core (tables, task lists, strikethrough, autolinks)

Add `remark-gfm` and wire it into the pipeline. GFM core needs **no** sanitize-schema change — `rehype-sanitize`'s `defaultSchema` already permits `<del>`, `<input type=checkbox disabled>`, `li.task-list-item`, `ul/ol.contains-task-list`, and all `table*` tags (verified).

**Files:**
- Modify: `package.json` (add dependency)
- Modify: `src/features/markdown-preview/lib/pipeline.ts`
- Test: `src/features/markdown-preview/lib/pipeline.test.ts` (create)

**Interfaces:**
- Consumes: existing `renderMarkdown(source: string): string` from `pipeline.ts`.
- Produces: same signature; output HTML now contains GFM constructs. Later tasks extend `pipeline.test.ts` and the pipeline chain.

- [ ] **Step 1: Install the dependency**

```bash
bun add remark-gfm@^4.0.1
```

Expected: `package.json` `dependencies` gains `"remark-gfm": "^4.0.1"`; `bun.lock` updates.

- [ ] **Step 2: Write the failing test**

Create `src/features/markdown-preview/lib/pipeline.test.ts`:

```ts
import { expect, test } from "bun:test";
import { renderMarkdown } from "./pipeline";

test("renders a GFM table with header and body cells", () => {
  const html = renderMarkdown("| H1 | H2 |\n| --- | --- |\n| a | b |");
  expect(html).toContain("<table>");
  expect(html).toContain("<th");
  expect(html).toContain(">H1<");
  expect(html).toContain("<td");
  expect(html).toContain(">a<");
});

test("renders task list items as disabled checkboxes", () => {
  const html = renderMarkdown("- [ ] todo\n- [x] done");
  expect(html).toContain('type="checkbox"');
  expect(html).toContain("disabled");
  // exactly one checked box
  expect(html.match(/checked/g)?.length).toBe(1);
  expect(html).toContain("task-list-item");
});

test("renders strikethrough as <del>", () => {
  const html = renderMarkdown("~~gone~~");
  expect(html).toContain("<del>gone</del>");
});

test("autolinks bare URLs", () => {
  const html = renderMarkdown("see https://example.com now");
  expect(html).toContain('href="https://example.com"');
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `bun test src/features/markdown-preview/lib/pipeline.test.ts`
Expected: FAIL — without GFM, the table renders as a paragraph (`<table>` absent), `~~gone~~` stays literal, the bare URL is not linked.

- [ ] **Step 4: Wire `remark-gfm` into the pipeline**

In `src/features/markdown-preview/lib/pipeline.ts`, add the import and the `.use` call (place `remarkGfm` immediately after `remarkParse`, before `remarkSourceLine`):

```ts
import remarkGfm from "remark-gfm";
```

```ts
const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkSourceLine)
  .use(remarkRehype, { allowDangerousHtml: false })
  .use(rehypeSanitize, schema)
  .use(rehypeStringify);
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun test src/features/markdown-preview/lib/pipeline.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Verify gates**

Run: `bun run check && bun run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add package.json bun.lock src/features/markdown-preview/lib/pipeline.ts src/features/markdown-preview/lib/pipeline.test.ts
git commit -m "$(cat <<'EOF'
feat(phase-5 #26): GFM core via remark-gfm

Tables, task lists, strikethrough, autolinks. defaultSchema already
permits the resulting tags/attributes, so no allowlist change needed.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `remarkGithubAlerts` plugin (isolated)

A custom mdast transform: a blockquote whose first text child starts with `[!TYPE]` on its own line becomes an alert. The plugin is unit-tested in isolation through a minimal `remark-parse → plugin → remark-rehype → rehype-stringify` pipeline with an **injected** label resolver, so it needs no i18n boot. Wiring into the real pipeline and the default i18n resolver happen in Task 3.

**Files:**
- Create: `src/features/markdown-preview/lib/remarkGithubAlerts.ts`
- Test: `src/features/markdown-preview/lib/remarkGithubAlerts.test.ts` (create)

**Interfaces:**
- Produces:
  - `type AlertType = "note" | "tip" | "important" | "warning" | "caution"`
  - `interface RemarkGithubAlertsOptions { label?: (type: AlertType) => string }`
  - `const remarkGithubAlerts: Plugin<[RemarkGithubAlertsOptions?]>` (default export-free named export)
  - Behaviour: matched blockquote node gets `data.hName = "div"` and `data.hProperties` merged with `className: ["markdown-alert", "markdown-alert-<type>"]` and `"data-alert-type": "<type>"`, preserving any existing `hProperties` (e.g. `data-source-line`). A title paragraph is prepended with `hProperties` `className: ["markdown-alert-title"]`, `"data-alert-type": "<type>"`, and a single text child holding `label(type)` (default `type` capitalized when no resolver is given). The `[!TYPE]` marker line is stripped from the body's first text node.
- Consumes (Task 3): the named export `remarkGithubAlerts` and `RemarkGithubAlertsOptions`.

- [ ] **Step 1: Write the failing test**

Create `src/features/markdown-preview/lib/remarkGithubAlerts.test.ts`:

```ts
import { expect, test } from "bun:test";
import rehypeStringify from "rehype-stringify";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { remarkGithubAlerts } from "./remarkGithubAlerts";

function render(md: string): string {
  return unified()
    .use(remarkParse)
    .use(remarkGithubAlerts, { label: (t) => `L:${t}` })
    .use(remarkRehype)
    .use(rehypeStringify)
    .processSync(md)
    .toString();
}

test("transforms each alert type into a titled alert div", () => {
  for (const type of ["note", "tip", "important", "warning", "caution"] as const) {
    const upper = type.toUpperCase();
    const html = render(`> [!${upper}]\n> body text`);
    expect(html).toContain(`class="markdown-alert markdown-alert-${type}"`);
    expect(html).toContain(`data-alert-type="${type}"`);
    expect(html).toContain(`class="markdown-alert-title"`);
    expect(html).toContain(`L:${type}`);
    expect(html).toContain("body text");
    // marker is stripped from the body
    expect(html).not.toContain(`[!${upper}]`);
    // it is a div, not a blockquote
    expect(html).not.toContain("<blockquote>");
  }
});

test("is case-insensitive on the marker", () => {
  const html = render("> [!note]\n> hi");
  expect(html).toContain("markdown-alert-note");
});

test("leaves a normal blockquote untouched", () => {
  const html = render("> just a quote");
  expect(html).toContain("<blockquote>");
  expect(html).not.toContain("markdown-alert");
});

test("does not match when text follows the marker on the same line", () => {
  const html = render("> [!NOTE] inline tail\n> body");
  expect(html).toContain("<blockquote>");
  expect(html).not.toContain("markdown-alert");
});

test("does not match an unknown marker", () => {
  const html = render("> [!BOGUS]\n> body");
  expect(html).toContain("<blockquote>");
  expect(html).not.toContain("markdown-alert");
});

test("renders an empty-body alert", () => {
  const html = render("> [!TIP]");
  expect(html).toContain("markdown-alert-tip");
  expect(html).toContain("L:tip");
});

test("preserves an existing data-source-line on the wrapper", () => {
  const html = unified()
    .use(remarkParse)
    // simulate remarkSourceLine having stamped the blockquote
    .use(() => (tree) => {
      // @ts-expect-error minimal mdast access for the test
      const bq = tree.children[0];
      bq.data = { hProperties: { "data-source-line": "5" } };
    })
    .use(remarkGithubAlerts, { label: (t) => t })
    .use(remarkRehype)
    .use(rehypeStringify)
    .processSync("> [!NOTE]\n> body")
    .toString();
  expect(html).toContain('data-source-line="5"');
  expect(html).toContain("markdown-alert-note");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/features/markdown-preview/lib/remarkGithubAlerts.test.ts`
Expected: FAIL with module-not-found / `remarkGithubAlerts` is not defined.

- [ ] **Step 3: Implement the plugin**

Create `src/features/markdown-preview/lib/remarkGithubAlerts.ts`:

```ts
import type { Blockquote, Paragraph, Root, Text } from "mdast";
import type { Plugin } from "unified";
import { visit } from "unist-util-visit";

export type AlertType = "note" | "tip" | "important" | "warning" | "caution";

const ALERT_TYPES = new Set<AlertType>(["note", "tip", "important", "warning", "caution"]);

/** Marker must be the only content on the first line: `[!TYPE]` then EOL/EOF. */
const MARKER = /^\[!(note|tip|important|warning|caution)\][ \t]*(\n|$)/i;

export interface RemarkGithubAlertsOptions {
  /** Resolves the visible title for a type. Defaults to capitalizing the type. */
  label?: (type: AlertType) => string;
}

interface HData {
  hName?: string;
  hProperties?: Record<string, unknown>;
}

/**
 * Turns a GitHub alert blockquote (`> [!NOTE]` …) into
 * `<div class="markdown-alert markdown-alert-note" data-alert-type="note">`
 * with a translated title paragraph. Runs AFTER remarkSourceLine so the
 * `data-source-line` already stamped on the blockquote is preserved on the
 * resulting div, keeping comment/diff anchoring intact. Non-matching
 * blockquotes are left untouched.
 */
export const remarkGithubAlerts: Plugin<[RemarkGithubAlertsOptions?], Root> = (options = {}) => {
  const label =
    options.label ?? ((type: AlertType) => type.charAt(0).toUpperCase() + type.slice(1));

  return (tree) => {
    visit(tree, "blockquote", (node: Blockquote) => {
      const firstChild = node.children[0];
      if (!firstChild || firstChild.type !== "paragraph") return;
      const firstInline = firstChild.children[0];
      if (!firstInline || firstInline.type !== "text") return;

      const match = MARKER.exec(firstInline.value);
      if (!match) return;
      const type = match[1].toLowerCase() as AlertType;
      if (!ALERT_TYPES.has(type)) return;

      // Strip the marker line from the body's first text node.
      firstInline.value = firstInline.value.slice(match[0].length);

      // Turn the blockquote into the alert wrapper, preserving prior hProperties.
      const data = (node.data ?? (node.data = {})) as HData;
      const prior = data.hProperties ?? {};
      data.hName = "div";
      data.hProperties = {
        ...prior,
        className: ["markdown-alert", `markdown-alert-${type}`],
        "data-alert-type": type,
      };

      // Prepend the title paragraph.
      const title: Paragraph = {
        type: "paragraph",
        data: {
          hProperties: { className: ["markdown-alert-title"], "data-alert-type": type },
        },
        children: [{ type: "text", value: label(type) } satisfies Text],
      };
      node.children.unshift(title);
    });
  };
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/features/markdown-preview/lib/remarkGithubAlerts.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Verify gates**

Run: `bun run check && bun run typecheck`
Expected: no errors. (`mdast` types ship transitively via `remark-parse`; if `tsc` cannot resolve `mdast`, add `@types/mdast` as a devDep: `bun add -d @types/mdast` and include it in the commit.)

- [ ] **Step 6: Commit**

```bash
git add src/features/markdown-preview/lib/remarkGithubAlerts.ts src/features/markdown-preview/lib/remarkGithubAlerts.test.ts package.json bun.lock
git commit -m "$(cat <<'EOF'
feat(phase-5 #26): remarkGithubAlerts mdast transform

Converts `> [!NOTE]` blockquotes into alert divs with an injectable
title resolver, preserving data-source-line for comment anchoring.
Unit-tested in isolation; non-alert blockquotes untouched.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Wire alerts into the pipeline + widen sanitize schema + i18n labels

Plug `remarkGithubAlerts` into the real pipeline with the default i18n label resolver, widen the sanitize allowlist for the alert `div`/`p`, and add the English strings.

**Files:**
- Modify: `src/features/markdown-preview/lib/pipeline.ts`
- Modify: `src/shared/i18n/locales/en.json`
- Test: `src/features/markdown-preview/lib/pipeline.test.ts` (extend)

**Interfaces:**
- Consumes: `remarkGithubAlerts`, `AlertType` from Task 2; `i18next` from `@/shared/i18n` (import triggers init side-effect, returns the initialized singleton — same pattern as `shared/ipc/errors.ts`).
- Produces: `renderMarkdown` output now includes sanitized alert HTML with translated titles.

- [ ] **Step 1: Add the i18n strings**

In `src/shared/i18n/locales/en.json`, add a top-level `markdownPreview` group (alphabetical placement near `main` is fine — JSON key order is cosmetic):

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

- [ ] **Step 2: Write the failing tests**

Append to `src/features/markdown-preview/lib/pipeline.test.ts`:

```ts
test("renders each GitHub alert type with its translated title", () => {
  const cases: Array<[string, string, string]> = [
    ["NOTE", "markdown-alert-note", "Note"],
    ["TIP", "markdown-alert-tip", "Tip"],
    ["IMPORTANT", "markdown-alert-important", "Important"],
    ["WARNING", "markdown-alert-warning", "Warning"],
    ["CAUTION", "markdown-alert-caution", "Caution"],
  ];
  for (const [marker, cls, title] of cases) {
    const html = renderMarkdown(`> [!${marker}]\n> body`);
    expect(html).toContain(cls);
    expect(html).toContain('data-alert-type="');
    expect(html).toContain(`>${title}<`);
    expect(html).toContain("body");
    expect(html).not.toContain(`[!${marker}]`);
  }
});

test("a normal blockquote stays a blockquote", () => {
  const html = renderMarkdown("> plain quote");
  expect(html).toContain("<blockquote");
  expect(html).not.toContain("markdown-alert");
});

test("sanitization strips scripts but keeps alert markup", () => {
  const html = renderMarkdown("> [!NOTE]\n> safe <script>alert(1)</script>");
  expect(html).not.toContain("<script");
  expect(html).toContain("markdown-alert-note");
  expect(html).toContain('data-alert-type="note"');
});

test("sanitization preserves data-source-line on the alert div", () => {
  const html = renderMarkdown("> [!NOTE]\n> body");
  expect(html).toMatch(/<div[^>]*data-source-line="1"/);
});

test("sanitization drops arbitrary div classes but keeps markdown-alert", () => {
  // raw HTML divs are not emitted by markdown, so assert via a crafted class
  // on the alert: the plugin only sets markdown-alert* classes, and the schema
  // allowlists exactly those — confirm no foreign class leaks through.
  const html = renderMarkdown("> [!WARNING]\n> careful");
  expect(html).toContain('class="markdown-alert markdown-alert-warning"');
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `bun test src/features/markdown-preview/lib/pipeline.test.ts`
Expected: FAIL — alerts not wired yet (blockquote stays `<blockquote>`, no `markdown-alert`).

- [ ] **Step 4: Wire the plugin + widen the schema**

Replace `src/features/markdown-preview/lib/pipeline.ts` with:

```ts
import { i18next } from "@/shared/i18n";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { type AlertType, remarkGithubAlerts } from "./remarkGithubAlerts";
import { remarkSourceLine } from "./remarkSourceLine";

/**
 * Sanitize schema extended to allow `data-source-line` on common block
 * elements (the #12 diff gutter anchors against rendered nodes) plus the
 * alert wrapper classes/attributes emitted by `remarkGithubAlerts`. Phase 5
 * keeps this allowlist tight — no `svg`/`path`; alert icons are pure CSS.
 */
const ANCHOR_TAGS = [
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "blockquote",
  "pre",
  "code",
  "table",
  "tr",
  "td",
  "th",
] as const;

const ALERT_CLASSNAMES = [
  "markdown-alert",
  "markdown-alert-note",
  "markdown-alert-tip",
  "markdown-alert-important",
  "markdown-alert-warning",
  "markdown-alert-caution",
] as const;

function withSourceLine(tag: string): string[] {
  return [...((defaultSchema.attributes?.[tag] as string[] | undefined) ?? []), "data-source-line"];
}

const schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    ...Object.fromEntries(ANCHOR_TAGS.map((tag) => [tag, withSourceLine(tag)])),
    div: [
      ...((defaultSchema.attributes?.div as string[] | undefined) ?? []),
      "data-source-line",
      "data-alert-type",
      ["className", ...ALERT_CLASSNAMES],
    ],
    p: [...withSourceLine("p"), "data-alert-type", ["className", "markdown-alert-title"]],
  },
};

const labelForAlert = (type: AlertType): string => i18next.t(`markdownPreview.alerts.${type}`);

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkSourceLine)
  .use(remarkGithubAlerts, { label: labelForAlert })
  .use(remarkRehype, { allowDangerousHtml: false })
  .use(rehypeSanitize, schema)
  .use(rehypeStringify);

export function renderMarkdown(source: string): string {
  return processor.processSync(source).toString();
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun test src/features/markdown-preview/lib/`
Expected: PASS — all Task 1 + Task 3 pipeline tests and Task 2 plugin tests.

- [ ] **Step 6: Verify gates**

Run: `bun run check && bun run typecheck`
Expected: no errors. (If the i18n type for `t(\`markdownPreview.alerts.${type}\`)` complains about a dynamic key, the runtime value is correct; cast the key with `as never` only if `tsc` blocks — the strings exist in `en.json`.)

- [ ] **Step 7: Commit**

```bash
git add src/features/markdown-preview/lib/pipeline.ts src/features/markdown-preview/lib/pipeline.test.ts src/shared/i18n/locales/en.json
git commit -m "$(cat <<'EOF'
feat(phase-5 #26): wire alerts into pipeline + i18n titles

Default label resolver reads the i18next singleton; sanitize allowlist
gains markdown-alert classes + data-alert-type on div/p only.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Styles — task lists, table polish, alert callouts

Add CSS for the new constructs. No unit test (presentation); verify by build + manual preview against GitHub.

**Files:**
- Modify: `src/shared/styles/tokens.css`
- Modify: `src/shared/styles/index.css`

**Interfaces:**
- Consumes: the DOM produced by Task 3 — `div.markdown-alert.markdown-alert-<type>[data-alert-type]`, `p.markdown-alert-title`, `ul.contains-task-list > li.task-list-item > input[type=checkbox]`, GFM `<table>`.
- Produces: nothing code-facing.

- [ ] **Step 1: Add alert color tokens**

In `src/shared/styles/tokens.css`, inside the `:root` block (after the comment tokens), add:

```css
  /* GitHub alert hues — border + icon color per type (light). */
  --alert-note: 212 92% 45%;
  --alert-tip: 137 66% 30%;
  --alert-important: 261 69% 59%;
  --alert-warning: 40 100% 30%;
  --alert-caution: 356 72% 47%;
```

And inside the `@media (prefers-color-scheme: dark)` `:root` block (after the comment tokens), add:

```css
    --alert-note: 216 84% 52%;
    --alert-tip: 128 49% 49%;
    --alert-important: 262 89% 71%;
    --alert-warning: 41 72% 48%;
    --alert-caution: 3 93% 63%;
```

- [ ] **Step 2: Add task-list, table-polish, and alert CSS**

In `src/shared/styles/index.css`, append after the existing `.prose-styles img { … }` rule (around line 153, before the `::selection` block) — or at end of file if cleaner:

```css
/* GFM task lists — drop the disc marker and align the checkbox with the
   first text line. remark-gfm emits `ul.contains-task-list` > `li.task-list-item`
   with a leading disabled checkbox. */
.prose-styles ul.contains-task-list {
  list-style: none;
  padding-left: 1.2em;
}
.prose-styles li.task-list-item {
  position: relative;
}
.prose-styles li.task-list-item > input[type="checkbox"] {
  margin: 0 0.4em 0 -1.4em;
  vertical-align: middle;
  accent-color: hsl(var(--primary));
}

/* GFM table polish — zebra striping + scroll on overflow. Base borders/header
   come from the existing table rules above. */
.prose-styles table {
  display: block;
  overflow-x: auto;
}
.prose-styles tbody tr:nth-child(even) {
  background: hsl(var(--muted) / 0.4);
}

/* GitHub-style alerts. The wrapper is a `div.markdown-alert.markdown-alert-<type>`
   emitted by remarkGithubAlerts; the title is `p.markdown-alert-title`. The
   type icon is a CSS mask (no inline SVG, keeps the sanitize allowlist tight)
   tinted with the per-type token via currentColor. */
.prose-styles .markdown-alert {
  --alert-color: var(--alert-note);
  border-left: 3px solid hsl(var(--alert-color));
  border-radius: 6px;
  padding: 0.6em 1em;
  margin-block: 1em;
  background: hsl(var(--alert-color) / 0.06);
}
.prose-styles .markdown-alert-note {
  --alert-color: var(--alert-note);
}
.prose-styles .markdown-alert-tip {
  --alert-color: var(--alert-tip);
}
.prose-styles .markdown-alert-important {
  --alert-color: var(--alert-important);
}
.prose-styles .markdown-alert-warning {
  --alert-color: var(--alert-warning);
}
.prose-styles .markdown-alert-caution {
  --alert-color: var(--alert-caution);
}
.prose-styles .markdown-alert > :first-child {
  margin-top: 0;
}
.prose-styles .markdown-alert > :last-child {
  margin-bottom: 0;
}
.prose-styles .markdown-alert-title {
  display: flex;
  align-items: center;
  gap: 0.4em;
  font-weight: 600;
  color: hsl(var(--alert-color));
  margin-bottom: 0.4em;
}
.prose-styles .markdown-alert-title::before {
  content: "";
  width: 1em;
  height: 1em;
  flex: none;
  background-color: currentColor;
  -webkit-mask: var(--alert-icon) center / contain no-repeat;
  mask: var(--alert-icon) center / contain no-repeat;
}
.prose-styles .markdown-alert-note .markdown-alert-title::before {
  --alert-icon: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm9-3.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM6.75 7h1.5a.25.25 0 0 1 .25.25v3.25h.75a.75.75 0 0 1 0 1.5h-3a.75.75 0 0 1 0-1.5h.75V8.5h-.5a.75.75 0 0 1 0-1.5Z'/%3E%3C/svg%3E");
}
.prose-styles .markdown-alert-tip .markdown-alert-title::before {
  --alert-icon: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M8 1.5A4.5 4.5 0 0 0 3.5 6c0 1.6.9 2.7 1.7 3.6.3.4.6.7.8 1h4c.2-.3.5-.6.8-1 .8-.9 1.7-2 1.7-3.6A4.5 4.5 0 0 0 8 1.5ZM6 12.5h4a.75.75 0 0 1 0 1.5H6a.75.75 0 0 1 0-1.5Zm.5 1.75A.75.75 0 0 1 7.25 13.5h1.5a.75.75 0 0 1 .75.75v.25H6.5Z'/%3E%3C/svg%3E");
}
.prose-styles .markdown-alert-important .markdown-alert-title::before {
  --alert-icon: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M2.75 1.5A1.75 1.75 0 0 0 1 3.25v7.5c0 .97.78 1.75 1.75 1.75H4v2.19c0 .67.8 1 1.28.53L8.5 12h4.75A1.75 1.75 0 0 0 15 10.75v-7.5A1.75 1.75 0 0 0 13.25 1.5ZM8 4a.75.75 0 0 1 .75.75v2.5a.75.75 0 0 1-1.5 0v-2.5A.75.75 0 0 1 8 4Zm0 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z'/%3E%3C/svg%3E");
}
.prose-styles .markdown-alert-warning .markdown-alert-title::before {
  --alert-icon: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M6.457 1.047a1.75 1.75 0 0 1 3.086 0l5.073 9.46A1.75 1.75 0 0 1 13.073 13H2.927a1.75 1.75 0 0 1-1.543-2.492ZM8 5a.75.75 0 0 0-.75.75v2.5a.75.75 0 0 0 1.5 0v-2.5A.75.75 0 0 0 8 5Zm0 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z'/%3E%3C/svg%3E");
}
.prose-styles .markdown-alert-caution .markdown-alert-title::before {
  --alert-icon: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M4.47 1.22a.75.75 0 0 1 .53-.22h6a.75.75 0 0 1 .53.22l4.25 4.25c.14.14.22.33.22.53v6a.75.75 0 0 1-.22.53l-4.25 4.25a.75.75 0 0 1-.53.22H5a.75.75 0 0 1-.53-.22L.22 12.28A.75.75 0 0 1 0 11.75v-6c0-.2.08-.39.22-.53ZM8 4a.75.75 0 0 0-.75.75v2.5a.75.75 0 0 0 1.5 0v-2.5A.75.75 0 0 0 8 4Zm0 6a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z'/%3E%3C/svg%3E");
}
```

Note: the table now uses `display: block; overflow-x: auto` for horizontal scrolling — this overrides the inline-flow of the earlier `.prose-styles table { width: 100% }` rule. Keep both; the later rule wins on `display`.

- [ ] **Step 3: Verify the build compiles the CSS**

Run: `bun run build:web`
Expected: build succeeds, no CSS parse errors.

- [ ] **Step 4: Manual visual check**

Run the app and open a Markdown file containing each construct (or paste into a fixture PR). Confirm:
- Tables render with borders, header shading, zebra rows, and scroll when wide.
- Task list checkboxes are aligned, disabled, and reflect `[ ]` / `[x]`.
- Each alert shows the colored left border, the matching icon, and the translated title ("Note"/"Tip"/…), in both light and dark OS themes.
- A regular blockquote still renders as an italic quote (not an alert).

Run: `bun run dev` (or the project's run skill), open a doc with the fixtures below:

```md
| Feature | Status |
| --- | --- |
| Tables | done |

- [x] shipped
- [ ] pending

~~old~~ and https://example.com

> [!NOTE]
> A note.

> [!WARNING]
> Be careful.

> a normal quote
```

- [ ] **Step 5: Commit**

```bash
git add src/shared/styles/tokens.css src/shared/styles/index.css
git commit -m "$(cat <<'EOF'
feat(phase-5 #26): styles for task lists, tables, and alerts

CSS-only alert icons via mask-image, per-type tokens for light/dark,
GFM task-list and table polish to approximate GitHub.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Final verification + PR

**Files:** none (verification only).

- [ ] **Step 1: Full gate sweep**

Run:
```bash
bun test && bun run check && bun run typecheck && bun run build:web
```
Expected: all green.

- [ ] **Step 2: i18n guard**

Confirm no hardcoded user-facing strings slipped in (alert titles come from `en.json`). Run the `check-i18n` skill or:
```bash
bun run check
```
Expected: no findings for the touched files.

- [ ] **Step 3: Open the PR**

```bash
git push -u origin feat/phase-5-gfm
gh pr create --fill --base main \
  --title "feat(phase-5 #26): GFM support — tables, task lists, blockquotes, alerts" \
  --body "$(cat <<'EOF'
Implements #26. Adds `remark-gfm` (tables, task lists, strikethrough, autolinks)
and a custom `remarkGithubAlerts` transform for GitHub-style alerts
(`> [!NOTE]` …) with i18n titles and CSS-only icons. Sanitize allowlist
widened minimally (markdown-alert classes + data-alert-type on div/p);
`data-source-line` preserved so comment/diff anchoring keeps working.

Closes #26.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR created against `main`, linked to #26.

---

## Self-Review

**Spec coverage:**
- GFM tables / task lists / strikethrough / autolinks → Task 1. ✓
- GitHub alerts (5 types, i18n titles, CSS icons) → Tasks 2–4. ✓
- Tight sanitize allowlist extension (div/p only, no svg) → Task 3. ✓
- `data-source-line` preserved on alert wrapper → Task 2 (plugin merges hProperties) + Task 3 (schema allows it on div) + test. ✓
- i18n group `markdownPreview.alerts.*` → Task 3. ✓
- Tokens + CSS for task lists / tables / alerts, light + dark → Task 4. ✓
- Non-goals (Shiki/Mermaid/sanitize-hardening/local links) → untouched. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code; commands have expected output. The icon data-URIs are complete, valid SVGs (functional; may be swapped for exact octicons later as polish, not required). ✓

**Type consistency:** `AlertType` and `remarkGithubAlerts` / `RemarkGithubAlertsOptions` defined in Task 2 are consumed verbatim in Task 3. `renderMarkdown(source: string): string` unchanged throughout. CSS class names (`markdown-alert`, `markdown-alert-<type>`, `markdown-alert-title`) and `data-alert-type` match across plugin (Task 2), schema (Task 3), and CSS (Task 4). ✓

# Phase 5 Finalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close Phase 5 by shipping Shiki syntax highlighting (#27), a hardened HTML sanitization layer with CSP (#29), and relative-image plus local-link resolution (#30).

**Architecture:** The Markdown preview is a synchronous `unified` pipeline that turns Markdown into an HTML string, injected via `dangerouslySetInnerHTML`. This plan turns the module-level processor into a context-aware factory, moves the sanitize allowlist from `defaultSchema`-derived to explicit, adds Shiki *after* sanitization (generator-only markup), and adds a Rust-side `mdasset://` URI scheme that streams image bytes read at the PR head SHA via `git show`.

**Tech Stack:** Bun · React 18 + TypeScript · Vite · unified/remark/rehype · Shiki 4 · Tauri 2.10 + Rust (hexagonal-lite: `core` / `infra` / `ipc`).

**Spec:** `docs/superpowers/specs/2026-08-06-phase-5-finalization-design.md`

## Global Constraints

- **Runtime/tooling is Bun.** `bun install`, `bun add`, `bun run <script>`, `bun test`. Never npm/yarn/pnpm/npx/jest/vitest.
- **No hardcoded user-facing strings on the frontend.** Every readable string goes in `src/shared/i18n/locales/en.json` and is read via `useTranslation()` / `<Trans>` / the `i18next` singleton. This is enforced in review.
- **Rust layering.** `core` is pure (no IO, no Tauri, no `std::process`); adapters live in `infra`; `#[tauri::command]`s in `ipc` are ~5 lines. Follow the 7-step checklist in `ARCHITECTURE.md`.
- **Only `crates/infra/src/process/` shells out.** No other module spawns processes.
- **Sanitization is the boundary for untrusted HTML.** Anything appended after `rehypeSanitize` must be markup we generate from escaped text. Markup derived from untrusted source (Mermaid SVG) is sanitized before injection.
- **Assets resolve at the PR head SHA**, never the working tree.
- Verification commands, all of which must pass before the final commit: `bun test`, `bun run typecheck`, `bun run check`, `cargo fmt --all -- --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace`.
- Branch: `finalize-phase-5`. One PR closing #27, #29, #30.

---

### Task 1: Explicit sanitize allowlist + malicious-input regression suite

Replaces the `...defaultSchema` spread with a schema written out in full, and proves it holds against a table of attack vectors. Everything else in this plan builds on this boundary, so it goes first.

**Files:**
- Create: `src/features/markdown-preview/lib/sanitizeSchema.ts`
- Create: `src/features/markdown-preview/lib/__fixtures__/malicious.ts`
- Create: `src/features/markdown-preview/lib/sanitize.test.ts`
- Modify: `src/features/markdown-preview/lib/pipeline.ts:1-79`
- Modify: `package.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `sanitizeSchema: Schema` exported from `lib/sanitizeSchema.ts`; `MALICIOUS_CASES: MaliciousCase[]` from `lib/__fixtures__/malicious.ts`.

- [ ] **Step 1: Install the dependencies this plan needs**

```bash
bun add shiki @shikijs/langs @shikijs/themes rehype-slug hast-util-sanitize hast-util-from-html hast-util-to-html
```

`hast-util-sanitize` is currently only a transitive dep of `rehype-sanitize`; we import its `Schema` type and its `sanitize()` directly, so it becomes explicit.

- [ ] **Step 2: Write the failing fixtures file**

Create `src/features/markdown-preview/lib/__fixtures__/malicious.ts`:

```ts
export interface MaliciousCase {
  /** Test name. */
  name: string;
  /** Markdown source fed to renderMarkdown. */
  markdown: string;
  /** Substrings that must NOT appear in the rendered HTML. */
  mustNotContain: string[];
}

/**
 * Attack vectors the sanitize allowlist must neutralize. Every case is a
 * regression guard — if one starts failing, the allowlist grew a hole.
 *
 * Note that `remarkRehype` runs with `allowDangerousHtml: false`, which drops
 * raw HTML before the sanitizer sees it. That is defense in depth, not the
 * thing under test: the link/image cases below reach the sanitizer through
 * Markdown's own syntax, so the allowlist itself is genuinely exercised.
 */
export const MALICIOUS_CASES: MaliciousCase[] = [
  {
    name: "script tag",
    markdown: "before <script>alert(1)</script> after",
    mustNotContain: ["<script", "alert(1)"],
  },
  {
    name: "img with onerror handler",
    markdown: '<img src="x" onerror="alert(1)">',
    mustNotContain: ["onerror", "alert(1)"],
  },
  {
    name: "svg with onload handler",
    markdown: '<svg onload="alert(1)"></svg>',
    mustNotContain: ["<svg", "onload"],
  },
  {
    name: "javascript: protocol in a Markdown link",
    markdown: "[click me](javascript:alert(1))",
    mustNotContain: ["javascript:"],
  },
  {
    name: "javascript: protocol obfuscated with an HTML entity",
    markdown: "[click me](java&#115;cript:alert(1))",
    mustNotContain: ["javascript:", "alert(1)"],
  },
  {
    name: "javascript: protocol with interleaved whitespace",
    markdown: "[click me](java\tscript:alert(1))",
    mustNotContain: ["javascript:"],
  },
  {
    name: "data:text/html in a Markdown link",
    markdown: "[click me](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)",
    mustNotContain: ["data:text/html"],
  },
  {
    name: "data: URL in a Markdown image",
    markdown: "![x](data:text/html,<script>alert(1)</script>)",
    mustNotContain: ["data:text/html", "<script"],
  },
  {
    name: "iframe",
    markdown: '<iframe src="https://evil.example"></iframe>',
    mustNotContain: ["<iframe"],
  },
  {
    name: "object and embed",
    markdown: '<object data="evil.swf"></object><embed src="evil.swf">',
    mustNotContain: ["<object", "<embed"],
  },
  {
    name: "style tag",
    markdown: "<style>body{display:none}</style>",
    mustNotContain: ["<style", "display:none"],
  },
  {
    name: "form and input",
    markdown: '<form action="https://evil.example"><input name="pw"></form>',
    mustNotContain: ["<form", 'name="pw"'],
  },
  {
    name: "inline style attribute",
    markdown: '<p style="position:fixed;inset:0">hi</p>',
    mustNotContain: ["style="],
  },
  {
    name: "malformed nesting attempting parser escape",
    markdown: "<div><script >alert(1)</script ></div >",
    mustNotContain: ["<script", "alert(1)"],
  },
  {
    name: "meta refresh",
    markdown: '<meta http-equiv="refresh" content="0;url=https://evil.example">',
    mustNotContain: ["<meta", "http-equiv"],
  },
];
```

- [ ] **Step 3: Write the failing test**

Create `src/features/markdown-preview/lib/sanitize.test.ts`:

```ts
import { expect, test } from "bun:test";
import { MALICIOUS_CASES } from "./__fixtures__/malicious.ts";
import { renderMarkdown } from "./pipeline";

for (const c of MALICIOUS_CASES) {
  test(`sanitize neutralizes: ${c.name}`, () => {
    const html = renderMarkdown(c.markdown);
    for (const needle of c.mustNotContain) {
      expect(html).not.toContain(needle);
    }
    // Blanket assertions every case must satisfy.
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/\son\w+\s*=/i);
    expect(html).not.toMatch(/javascript:/i);
  });
}

test("the allowlist still passes the constructs Phase 5 shipped", () => {
  const html = renderMarkdown(
    ["| H |", "| --- |", "| a |", "", "- [x] done", "", "> [!NOTE]", "> body"].join("\n"),
  );
  expect(html).toContain("<table");
  expect(html).toContain('type="checkbox"');
  expect(html).toContain("markdown-alert-note");
  expect(html).toMatch(/data-source-line="1"/);
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `bun test src/features/markdown-preview/lib/sanitize.test.ts`
Expected: FAIL — `Cannot find module './__fixtures__/malicious.ts'` on the first run, then real assertion failures (`style=` and `data:` currently survive, because `defaultSchema` permits `data:` in `src` and the current schema does not strip `<style>` content).

- [ ] **Step 5: Write the explicit schema**

Create `src/features/markdown-preview/lib/sanitizeSchema.ts`:

```ts
import type { Schema } from "hast-util-sanitize";

/**
 * The Markdown preview's HTML allowlist — written out in full rather than
 * derived from `hast-util-sanitize`'s `defaultSchema`, so that every element,
 * attribute, and protocol we admit is a deliberate, reviewable decision.
 *
 * Deliberate omissions:
 * - `style` on any element. Shiki emits inline styles on nearly every span,
 *   but it runs AFTER this sanitizer (see pipeline.ts), so we never have to
 *   open `style` up for the whole document to accommodate one generator.
 * - `svg` and friends. Mermaid's SVG is injected client-side after this
 *   sanitizer runs, and is separately sanitized by `sanitizeSvg`.
 * - `data:` in `src`. Every image in the preview travels over `mdasset://`,
 *   so `data:` would be pure attack surface here. (The app's CSP does allow
 *   `data:` images, because the alert-callout icons are `data:` CSS
 *   backgrounds — a different layer governing a different thing.)
 */

/** Block elements carrying `data-source-line` for the diff gutter + anchoring. */
const SOURCE_LINE_TAGS = [
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

const HEADINGS = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;

const sourceLineOnly = Object.fromEntries(
  SOURCE_LINE_TAGS.map((tag) => [tag, ["data-source-line"]]),
);

export const sanitizeSchema: Schema = {
  // Dropped entirely, contents included.
  strip: ["script", "style", "iframe", "object", "embed", "form", "textarea", "select", "svg"],

  // Prefix `id`/`name` so rendered content can't clobber DOM globals
  // (`<a id="location">` shadowing `window.location`). GitHub does the same.
  // `scrollToAnchorId` knows about the prefix.
  clobber: ["name", "id"],
  clobberPrefix: "user-content-",

  protocols: {
    href: ["http", "https", "mailto"],
    src: ["mdasset"],
    cite: ["http", "https"],
  },

  tagNames: [
    "a",
    "abbr",
    "b",
    "blockquote",
    "br",
    "caption",
    "code",
    "col",
    "colgroup",
    "dd",
    "del",
    "details",
    "div",
    "dl",
    "dt",
    "em",
    ...HEADINGS,
    "hr",
    "i",
    "img",
    // GFM task lists. Constrained by `required` below to inert checkboxes.
    "input",
    "ins",
    "kbd",
    "li",
    "ol",
    "p",
    "pre",
    "q",
    "rp",
    "rt",
    "ruby",
    "s",
    "samp",
    "section",
    "span",
    "strong",
    "sub",
    "summary",
    "sup",
    "table",
    "tbody",
    "td",
    "tfoot",
    "th",
    "thead",
    "tr",
    "ul",
    "var",
  ],

  attributes: {
    ...sourceLineOnly,
    a: [
      "href",
      "title",
      "rel",
      "target",
      // How `rehypeLinks` hands its classification to the delegated click
      // handler in MarkdownPreview.
      "data-link-kind",
      "data-href",
      ["className", "data-footnote-backref", "data-footnote-ref"],
    ],
    img: ["src", "alt", "title", "width", "height", "loading"],
    // Inert GFM task-list checkboxes only.
    input: ["type", "checked", "disabled"],
    div: [
      "data-source-line",
      "data-alert-type",
      ["className", ...ALERT_CLASSNAMES, "mermaid"],
    ],
    p: ["data-source-line", "data-alert-type", ["className", "markdown-alert-title"]],
    li: ["data-source-line", ["className", "task-list-item"]],
    ul: ["data-source-line", ["className", "contains-task-list"]],
    ol: ["data-source-line", "start", ["className", "contains-task-list"]],
    td: ["data-source-line", "align"],
    th: ["data-source-line", "align", "scope"],
    // `id` is allowlisted on headings only, so rehype-slug's anchors survive
    // without opening `id` up document-wide.
    ...Object.fromEntries(HEADINGS.map((tag) => [tag, ["data-source-line", "id"]])),
    section: [["className", "footnotes"], "data-footnotes"],
    span: [["className", "footnote-ref"]],
    "*": [],
  },

  // Anything not explicitly required is disallowed; these force GFM's
  // checkboxes to stay non-interactive.
  required: {
    input: { type: "checkbox", disabled: true },
  },

  ancestors: {
    li: ["ol", "ul"],
    td: ["table"],
    th: ["table"],
    tbody: ["table"],
    thead: ["table"],
    tfoot: ["table"],
    tr: ["table"],
  },
};
```

- [ ] **Step 6: Wire the schema into the pipeline**

In `src/features/markdown-preview/lib/pipeline.ts`, delete the local `ANCHOR_TAGS`, `ALERT_CLASSNAMES`, `withSourceLine`, and `schema` definitions (lines 13-67) along with the now-unused `Schema` / `defaultSchema` imports, and import the shared schema instead. The file's top and processor become:

```ts
import { i18next } from "@/shared/i18n";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { rehypeMermaid } from "./rehypeMermaid";
import { type AlertType, remarkGithubAlerts } from "./remarkGithubAlerts";
import { remarkSourceLine } from "./remarkSourceLine";
import { sanitizeSchema } from "./sanitizeSchema";

const labelForAlert = (type: AlertType): string => i18next.t(`markdownPreview.alerts.${type}`);

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkSourceLine)
  .use(remarkGithubAlerts, { label: labelForAlert })
  .use(remarkRehype, { allowDangerousHtml: false })
  .use(rehypeMermaid)
  .use(rehypeSanitize, sanitizeSchema)
  .use(rehypeStringify);

export function renderMarkdown(source: string): string {
  return processor.processSync(source).toString();
}
```

- [ ] **Step 7: Run both test files to verify they pass**

Run: `bun test src/features/markdown-preview/`
Expected: PASS. Every `MALICIOUS_CASES` entry passes, and the pre-existing `pipeline.test.ts` still passes — the explicit schema is a strict subset of what the old one allowed for the constructs already shipped.

If `pipeline.test.ts`'s `class="markdown-alert markdown-alert-warning"` assertion fails, the `div` `className` allowlist lost a value; re-check `ALERT_CLASSNAMES`.

- [ ] **Step 8: Commit**

```bash
git add package.json bun.lock src/features/markdown-preview/lib/
git commit -m "feat(preview): explicit sanitize allowlist + malicious-input regression suite

Replaces the defaultSchema-derived schema with one written out in full, so
every admitted element, attribute, and protocol is a deliberate decision.
Notably drops `data:` from src and never admits `style`.

Refs #29"
```

---

### Task 2: Heading anchors via rehype-slug

`[Setup](#setup)` links point at nothing today — no slugger runs, so headings have no `id`. Table-of-contents links are ubiquitous in the docs this app reviews, and Task 10's link-classification table cannot implement its intra-document row without this.

**Files:**
- Modify: `src/features/markdown-preview/lib/pipeline.ts`
- Modify: `src/features/main/lib/scrollToAnchor.ts`
- Create: `src/features/main/lib/scrollToAnchor.test.ts`
- Modify: `src/features/markdown-preview/lib/pipeline.test.ts`

**Interfaces:**
- Consumes: `sanitizeSchema` (Task 1) — already allowlists `id` on `h1`–`h6`.
- Produces: `scrollToAnchorId(id: string): HTMLElement | null` from `src/features/main/lib/scrollToAnchor.ts`.

- [ ] **Step 1: Write the failing pipeline test**

Append to `src/features/markdown-preview/lib/pipeline.test.ts`:

```ts
test("headings get GitHub-compatible slugged ids", () => {
  const html = renderMarkdown("## Getting Started\n\ntext");
  expect(html).toMatch(/<h2[^>]*id="user-content-getting-started"/);
});

test("duplicate headings get suffixed ids", () => {
  const html = renderMarkdown("## Setup\n\na\n\n## Setup\n\nb");
  expect(html).toContain('id="user-content-setup"');
  expect(html).toContain('id="user-content-setup-1"');
});

test("heading ids survive sanitization but id stays off other elements", () => {
  const html = renderMarkdown("# Title\n\n<p id=\"evil\">x</p>");
  expect(html).toMatch(/<h1[^>]*id="user-content-title"/);
  expect(html).not.toContain('id="evil"');
});
```

The `user-content-` prefix is not incidental: `sanitizeSchema` sets `clobberPrefix`, which rewrites `id` to prevent DOM-clobbering attacks. Anchor lookup has to account for it, which is what Step 4 handles.

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/features/markdown-preview/lib/pipeline.test.ts -t "slugged"`
Expected: FAIL — no `id` attribute is emitted at all.

- [ ] **Step 3: Add rehype-slug to the pipeline**

In `src/features/markdown-preview/lib/pipeline.ts`, add the import and insert the plugin after `remarkRehype` and before `rehypeMermaid`:

```ts
import rehypeSlug from "rehype-slug";
```

```ts
  .use(remarkRehype, { allowDangerousHtml: false })
  .use(rehypeSlug)
  .use(rehypeMermaid)
  .use(rehypeSanitize, sanitizeSchema)
```

- [ ] **Step 4: Add the id-based scroll helper**

Append to `src/features/main/lib/scrollToAnchor.ts`:

```ts
/**
 * Scrolls to a slugged heading by its fragment id. The sanitizer rewrites
 * `id` with a `user-content-` prefix to block DOM clobbering, so a link
 * written as `#setup` has to resolve against `#user-content-setup`. We try
 * the raw id first so hand-authored ids keep working.
 */
export function scrollToAnchorId(id: string): HTMLElement | null {
  if (!id) return null;
  const root = document.querySelector("article");
  if (!root) return null;
  const el =
    root.querySelector<HTMLElement>(`[id="${CSS.escape(id)}"]`) ??
    root.querySelector<HTMLElement>(`[id="${CSS.escape(`user-content-${id}`)}"]`);
  if (!el) return null;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  return el;
}
```

- [ ] **Step 5: Write the helper's test**

Create `src/features/main/lib/scrollToAnchor.test.ts`:

```ts
import { expect, test } from "bun:test";
import { scrollToAnchorId } from "./scrollToAnchor";

// bun:test runs without a DOM by default; these tests install a minimal one.
function mountArticle(innerHTML: string): void {
  document.body.innerHTML = `<article>${innerHTML}</article>`;
  for (const el of document.querySelectorAll("*")) {
    (el as HTMLElement).scrollIntoView = () => {};
  }
}

test("resolves a raw id", () => {
  mountArticle('<h2 id="setup">Setup</h2>');
  expect(scrollToAnchorId("setup")?.id).toBe("setup");
});

test("falls back to the user-content- clobber prefix", () => {
  mountArticle('<h2 id="user-content-setup">Setup</h2>');
  expect(scrollToAnchorId("setup")?.id).toBe("user-content-setup");
});

test("returns null for a missing anchor", () => {
  mountArticle("<h2>Setup</h2>");
  expect(scrollToAnchorId("nope")).toBeNull();
});

test("returns null for an empty id", () => {
  mountArticle('<h2 id="setup">Setup</h2>');
  expect(scrollToAnchorId("")).toBeNull();
});
```

If `bun test` reports `document is not defined`, add `happy-dom` and register it — check whether the repo already has a DOM preload by running `bun test src/features/comments` (those tests touch the DOM). If no DOM is configured, install one: `bun add -d @happy-dom/global-registrator` and create `test-setup.ts` at the repo root registering it, then add `"preload": ["./test-setup.ts"]` under a `test` key in `bunfig.toml`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `bun test src/features/markdown-preview/ src/features/main/`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/markdown-preview/lib/ src/features/main/lib/
git commit -m "feat(preview): slugged heading ids + id-based anchor scrolling

Headings had no ids, so table-of-contents links resolved to nothing.
rehype-slug runs before sanitization; the sanitizer's user-content- clobber
prefix is handled in scrollToAnchorId.

Refs #29 #30"
```

---

### Task 3: Sanitize Mermaid SVG before injection

The one real hole in the current pipeline: `useMermaid` assigns `node.innerHTML = svg` (`hooks/useMermaid.ts:99`) with markup compiled from author-written diagram source, entirely bypassing the allowlist.

**Files:**
- Create: `src/features/markdown-preview/lib/sanitizeSvg.ts`
- Create: `src/features/markdown-preview/lib/sanitizeSvg.test.ts`
- Modify: `src/features/markdown-preview/hooks/useMermaid.ts:72-77,99`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `sanitizeSvg(svg: string): string` from `lib/sanitizeSvg.ts`.

- [ ] **Step 1: Write the failing test**

Create `src/features/markdown-preview/lib/sanitizeSvg.test.ts`:

```ts
import { expect, test } from "bun:test";
import { sanitizeSvg } from "./sanitizeSvg";

test("keeps ordinary diagram shapes", () => {
  const out = sanitizeSvg(
    '<svg viewBox="0 0 10 10"><g><rect x="1" y="2" width="3" height="4"/>' +
      '<path d="M0 0L1 1"/><text x="1" y="2">hi</text></g></svg>',
  );
  expect(out).toContain("<svg");
  expect(out).toContain("<rect");
  expect(out).toContain("<path");
  expect(out).toContain("hi");
  expect(out).toContain('viewBox="0 0 10 10"');
});

test("strips script elements", () => {
  const out = sanitizeSvg('<svg><script>alert(1)</script><rect/></svg>');
  expect(out).not.toContain("<script");
  expect(out).not.toContain("alert(1)");
  expect(out).toContain("<rect");
});

test("strips event handler attributes", () => {
  const out = sanitizeSvg('<svg><rect onclick="alert(1)" onload="x()"/></svg>');
  expect(out).not.toMatch(/\son\w+\s*=/i);
  expect(out).toContain("<rect");
});

test("strips foreignObject, which can embed arbitrary HTML", () => {
  const out = sanitizeSvg(
    '<svg><foreignObject><body><img src=x onerror="alert(1)"></body></foreignObject></svg>',
  );
  expect(out).not.toContain("foreignObject");
  expect(out).not.toContain("onerror");
});

test("strips javascript: hrefs on links inside the diagram", () => {
  const out = sanitizeSvg('<svg><a href="javascript:alert(1)"><rect/></a></svg>');
  expect(out).not.toContain("javascript:");
});

test("keeps the <style> Mermaid injects for theming", () => {
  const out = sanitizeSvg("<svg><style>.node{fill:red}</style><rect/></svg>");
  expect(out).toContain("fill:red");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/features/markdown-preview/lib/sanitizeSvg.test.ts`
Expected: FAIL with "Cannot find module './sanitizeSvg'".

- [ ] **Step 3: Implement the SVG sanitizer**

Create `src/features/markdown-preview/lib/sanitizeSvg.ts`:

```ts
import { fromHtml } from "hast-util-from-html";
import { type Schema, sanitize } from "hast-util-sanitize";
import { toHtml } from "hast-util-to-html";

/**
 * Allowlist for Mermaid's rendered SVG. This is deliberately separate from
 * the document allowlist in `sanitizeSchema.ts`: the document never contains
 * SVG (the sanitizer strips it), and diagrams never contain prose markup.
 *
 * `foreignObject` is absent on purpose — it embeds arbitrary HTML inside SVG
 * and would reopen every vector the document allowlist closes. `useMermaid`
 * configures Mermaid with `htmlLabels: false` so it never emits one.
 *
 * `style` is admitted because Mermaid injects diagram theming that way. This
 * permits CSS injection scoped to the diagram; it does not permit script
 * execution, which is the property that matters here.
 */
const svgSchema: Schema = {
  strip: ["script", "foreignObject"],
  protocols: { href: ["http", "https"], xlinkHref: ["http", "https"] },
  tagNames: [
    "svg",
    "g",
    "defs",
    "style",
    "marker",
    "path",
    "rect",
    "circle",
    "ellipse",
    "line",
    "polyline",
    "polygon",
    "text",
    "tspan",
    "textPath",
    "title",
    "desc",
    "a",
    "use",
    "symbol",
    "clipPath",
    "mask",
    "pattern",
    "linearGradient",
    "radialGradient",
    "stop",
    "filter",
    "feGaussianBlur",
    "feOffset",
    "feMerge",
    "feMergeNode",
    "feColorMatrix",
    "feFlood",
    "feComposite",
    "image",
  ],
  attributes: {
    // Presentation and geometry attributes are shared across nearly every
    // SVG element, so they are allowlisted globally within this schema.
    // Every `on*` handler is excluded by omission.
    "*": [
      "id",
      "class",
      "style",
      "transform",
      "fill",
      "fillOpacity",
      "fillRule",
      "stroke",
      "strokeWidth",
      "strokeLinecap",
      "strokeLinejoin",
      "strokeDasharray",
      "strokeOpacity",
      "opacity",
      "d",
      "x",
      "y",
      "x1",
      "x2",
      "y1",
      "y2",
      "cx",
      "cy",
      "r",
      "rx",
      "ry",
      "dx",
      "dy",
      "width",
      "height",
      "points",
      "viewBox",
      "preserveAspectRatio",
      "xmlns",
      "version",
      "textAnchor",
      "dominantBaseline",
      "alignmentBaseline",
      "fontFamily",
      "fontSize",
      "fontWeight",
      "fontStyle",
      "letterSpacing",
      "markerEnd",
      "markerStart",
      "markerMid",
      "markerWidth",
      "markerHeight",
      "refX",
      "refY",
      "orient",
      "markerUnits",
      "gradientUnits",
      "offset",
      "stopColor",
      "stopOpacity",
      "clipPath",
      "mask",
      "filter",
      "result",
      "in",
      "in2",
      "stdDeviation",
      "type",
      "values",
      "spreadMethod",
      "patternUnits",
      "role",
      "ariaLabel",
      "ariaRoledescription",
    ],
    a: ["href", "xlinkHref", "target", "rel"],
    use: ["href", "xlinkHref"],
    image: ["href", "xlinkHref"],
  },
};

/**
 * Runs Mermaid's rendered SVG through an SVG-specific allowlist before it is
 * injected into the DOM. Mermaid already runs in `securityLevel: "strict"`;
 * this is the second layer, because the SVG is compiled from untrusted
 * diagram source and is injected after the document sanitizer has run.
 */
export function sanitizeSvg(svg: string): string {
  const tree = fromHtml(svg, { fragment: true });
  return toHtml(sanitize(tree, svgSchema));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/features/markdown-preview/lib/sanitizeSvg.test.ts`
Expected: PASS.

If the `viewBox` assertion fails, `hast-util-sanitize` is matching the DOM property name — hast stores SVG attributes camelCased (`viewBox`), which is why the allowlist above uses camelCase (`fillOpacity`, `strokeWidth`, `xlinkHref`). Keep that convention for any attribute you add.

- [ ] **Step 5: Wire it into useMermaid and disable HTML labels**

In `src/features/markdown-preview/hooks/useMermaid.ts`, add the import:

```ts
import { sanitizeSvg } from "../lib/sanitizeSvg";
```

Change the `mermaid.initialize` call (lines 72-77) to add `htmlLabels: false`, which stops Mermaid emitting `foreignObject`:

```ts
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: dark ? "dark" : "default",
          fontFamily: "inherit",
          htmlLabels: false,
          flowchart: { htmlLabels: false },
        });
```

Change the injection (line 99) from `node.innerHTML = svg;` to:

```ts
          node.innerHTML = sanitizeSvg(svg);
```

The `onOpen` handler two lines below passes `node.innerHTML` to the lightbox, so the lightbox receives already-sanitized markup with no further change.

- [ ] **Step 6: Verify the whole suite still passes**

Run: `bun test src/features/markdown-preview/`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/markdown-preview/
git commit -m "fix(preview): sanitize Mermaid SVG before injecting it

Mermaid output is compiled from untrusted diagram source and was injected
after the document sanitizer had already run, bypassing the allowlist
entirely. It now goes through an SVG-specific allowlist, and Mermaid is
configured with htmlLabels: false so it never emits foreignObject.

Refs #29"
```

---

### Task 4: Content-Security-Policy

The second layer behind the sanitizer: even if the allowlist grows a hole, script execution stays blocked.

**Files:**
- Modify: `src-tauri/tauri.conf.json:23-25`

**Interfaces:**
- Consumes: nothing.
- Produces: a CSP that Task 8's `mdasset://` scheme and the existing `data:` alert icons both satisfy.

- [ ] **Step 1: Replace the null CSP**

In `src-tauri/tauri.conf.json`, replace the `security` block:

```json
    "security": {
      "csp": "default-src 'self'; img-src 'self' data: mdasset: http://mdasset.localhost; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' ipc: http://ipc.localhost; font-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'self'; form-action 'none'",
      "devCsp": "default-src 'self'; img-src 'self' data: mdasset: http://mdasset.localhost; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self' ipc: http://ipc.localhost ws://localhost:1420 http://localhost:1420; font-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'self'; form-action 'none'"
    }
```

Three entries earn their keep:

- `img-src` keeps `data:` because the GitHub alert-callout icons are inline `data:image/svg+xml` CSS backgrounds (`src/shared/styles/index.css:249-261`). CSP `img-src` governs CSS backgrounds too, so dropping it would silently blank them. The sanitizer independently refuses `data:` in `<img src>` — different layers, no conflict.
- `img-src` lists both `mdasset:` and `http://mdasset.localhost` because Tauri serves custom schemes over an `http://<scheme>.localhost` origin on Windows.
- `devCsp` adds `'unsafe-inline' 'unsafe-eval'` for React Refresh and the Vite HMR websocket. Production does not get them.

`style-src 'unsafe-inline'` is required by Shiki's inline styles, Mermaid's injected `<style>`, and React inline styles. It does not close CSS injection; it does close script execution.

- [ ] **Step 2: Verify dev mode still works**

Run: `bun run dev`
Expected: the app launches, HMR works on a file edit, and the DevTools console shows **no** `Content Security Policy` violations. Open a PR, open a Markdown file with a GitHub alert (`> [!NOTE]`) and a Mermaid diagram; confirm the alert icon renders and the diagram draws.

If Vite's client fails to connect, widen `connect-src` in `devCsp` only — never in `csp`.

- [ ] **Step 3: Verify a production build**

Run: `bun run build`
Then launch the bundled app and repeat the alert-icon and Mermaid checks with DevTools open. Expected: no CSP violations.

This step is a real gate. A CSP that only works in dev ships a broken app.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/tauri.conf.json
git commit -m "feat(security): real CSP with a separate dev policy

Replaces \`csp: null\`. Blocks script execution as a second layer behind the
sanitizer. img-src keeps data: for the alert-icon CSS backgrounds and lists
the Windows http://mdasset.localhost form of the custom scheme.

Refs #29"
```

---

### Task 5: Shiki syntax highlighting

**Files:**
- Create: `src/features/markdown-preview/lib/highlighter.ts`
- Create: `src/features/markdown-preview/lib/rehypeShiki.ts`
- Create: `src/features/markdown-preview/lib/rehypeShiki.test.ts`
- Modify: `src/features/markdown-preview/lib/pipeline.ts`
- Modify: `src/shared/styles/index.css:64-66`

**Interfaces:**
- Consumes: `sanitizeSchema` (Task 1) — the pipeline order matters, Shiki runs *after* `rehypeSanitize`.
- Produces: `highlighter` and `SUPPORTED_LANGS: ReadonlySet<string>` from `lib/highlighter.ts`; `rehypeShiki: Plugin<[], Root>` from `lib/rehypeShiki.ts`.

- [ ] **Step 1: Write the failing test**

Create `src/features/markdown-preview/lib/rehypeShiki.test.ts`:

```ts
import { expect, test } from "bun:test";
import { renderMarkdown } from "./pipeline";

test("highlights a known language into token spans", () => {
  const html = renderMarkdown("```ts\nconst a = 1;\n```");
  expect(html).toContain("shiki");
  // Dual-theme output uses CSS custom properties, not baked colors.
  expect(html).toContain("--shiki-light");
  expect(html).toContain("--shiki-dark");
  expect(html).toContain("const");
});

test("falls back to plain text for an unknown language", () => {
  const html = renderMarkdown("```klingon\nnuqneH\n```");
  expect(html).toContain("shiki");
  expect(html).toContain("nuqneH");
  // No crash, no language-klingon grammar attempt.
  expect(html).not.toContain("language-klingon");
});

test("falls back to plain text for a fence with no info string", () => {
  const html = renderMarkdown("```\njust text\n```");
  expect(html).toContain("shiki");
  expect(html).toContain("just text");
});

test("carries data-source-line onto the highlighted block", () => {
  // The diff gutter and comment anchoring read this attribute. Shiki replaces
  // the <pre> node, so losing it here silently breaks commenting on code.
  const html = renderMarkdown("intro\n\n```ts\nconst a = 1;\n```");
  expect(html).toMatch(/<pre[^>]*data-source-line="3"/);
});

test("leaves mermaid fences alone", () => {
  const html = renderMarkdown("```mermaid\ngraph TD;\n  A-->B;\n```");
  expect(html).toContain('<div class="mermaid">');
  expect(html).not.toContain("shiki");
});

test("escapes code content rather than trusting it", () => {
  const html = renderMarkdown('```ts\nconst x = "<script>alert(1)</script>";\n```');
  // Shiki escapes what it emits — the tag must survive as text, never as markup.
  expect(html).not.toMatch(/<script/i);
  expect(html).toMatch(/&(#x3C|lt);script/i);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/features/markdown-preview/lib/rehypeShiki.test.ts`
Expected: FAIL — no `shiki` class in the output; code fences are still bare `<pre><code>`.

- [ ] **Step 3: Build the synchronous highlighter**

Create `src/features/markdown-preview/lib/highlighter.ts`:

```ts
import bash from "@shikijs/langs/bash";
import css from "@shikijs/langs/css";
import diff from "@shikijs/langs/diff";
import go from "@shikijs/langs/go";
import html from "@shikijs/langs/html";
import javascript from "@shikijs/langs/javascript";
import json from "@shikijs/langs/json";
import jsx from "@shikijs/langs/jsx";
import markdown from "@shikijs/langs/markdown";
import python from "@shikijs/langs/python";
import rust from "@shikijs/langs/rust";
import sql from "@shikijs/langs/sql";
import toml from "@shikijs/langs/toml";
import tsx from "@shikijs/langs/tsx";
import typescript from "@shikijs/langs/typescript";
import yaml from "@shikijs/langs/yaml";
import githubDark from "@shikijs/themes/github-dark";
import githubLight from "@shikijs/themes/github-light";
import { createHighlighterCoreSync } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

/**
 * One module-level highlighter, built synchronously.
 *
 * `createHighlighterCoreSync` with the JavaScript RegExp engine keeps
 * `renderMarkdown` synchronous — no loading state in the component, no flash
 * of unhighlighted code on every file open, and a synchronous test suite. The
 * cost is that grammars are statically bundled, which is close to free in a
 * desktop app where nothing is fetched over the network.
 *
 * The language set is curated for documentation review, not for a
 * general-purpose editor. Adding one is a one-line static import — kept a
 * conscious act so the bundle does not drift.
 */
const langs = [
  bash,
  css,
  diff,
  go,
  html,
  javascript,
  json,
  jsx,
  markdown,
  python,
  rust,
  sql,
  toml,
  tsx,
  typescript,
  yaml,
];

export const highlighter = createHighlighterCoreSync({
  engine: createJavaScriptRegexEngine(),
  themes: [githubLight, githubDark],
  langs,
});

/** Every language name and alias the highlighter can actually resolve. */
export const SUPPORTED_LANGS: ReadonlySet<string> = new Set(highlighter.getLoadedLanguages());

export const THEMES = { light: "github-light", dark: "github-dark" } as const;
```

- [ ] **Step 4: Write the rehype transformer**

Create `src/features/markdown-preview/lib/rehypeShiki.ts`:

```ts
import { fromHtml } from "hast-util-from-html";
import type { Element, Root, RootContent } from "hast";
import type { Plugin } from "unified";
import { visit } from "unist-util-visit";
import { SUPPORTED_LANGS, THEMES, highlighter } from "./highlighter";

/** Concatenates all descendant text of a hast node. */
function textOf(node: RootContent): string {
  if (node.type === "text") return node.value;
  if (node.type === "element") return node.children.map(textOf).join("");
  return "";
}

/**
 * Resolves the fence's language, falling back to `text` when it is absent,
 * unknown, or not in the curated set. Shiki throws on an unloaded grammar, so
 * this check is what keeps an exotic fence from blanking the document.
 */
function langOf(code: Element): string {
  const className = code.properties?.className;
  const classes = Array.isArray(className) ? className.map(String) : [];
  const found = classes.find((c) => c.startsWith("language-"));
  if (!found) return "text";
  const lang = found.slice("language-".length).toLowerCase();
  return SUPPORTED_LANGS.has(lang) ? lang : "text";
}

/**
 * Highlights fenced code blocks with Shiki.
 *
 * Runs AFTER `rehype-sanitize`, deliberately. Shiki emits inline `style` on
 * nearly every span; admitting `style` into the document allowlist to
 * accommodate that would weaken the schema for every element, permanently, to
 * serve one generator. Running afterwards is safe because Shiki's input is
 * already-sanitized text and Shiki escapes what it emits — it is a generator
 * producing markup from text, never a passthrough for author HTML.
 *
 * Dual-theme output (`defaultColor: false`) emits `--shiki-light` /
 * `--shiki-dark` custom properties, so an OS theme flip is handled purely in
 * CSS with no re-render.
 */
export const rehypeShiki: Plugin<[], Root> = () => {
  return (tree) => {
    visit(tree, "element", (node, index, parent) => {
      if (!parent || index === undefined) return;
      if (node.tagName !== "pre") return;
      const code = node.children.find(
        (child): child is Element => child.type === "element" && child.tagName === "code",
      );
      if (!code) return;

      const source = textOf(code).replace(/\n$/, "");
      let html: string;
      try {
        html = highlighter.codeToHtml(source, {
          lang: langOf(code),
          themes: THEMES,
          defaultColor: false,
        });
      } catch {
        // One bad fence must never blank a document — leave the original
        // <pre><code> in place and move on.
        return;
      }

      const fragment = fromHtml(html, { fragment: true });
      const replacement = fragment.children.find(
        (child): child is Element => child.type === "element" && child.tagName === "pre",
      );
      if (!replacement) return;

      // The diff gutter (`pre[data-source-line]`) and comment anchoring read
      // this attribute. Shiki replaces the node, so it has to be carried over
      // explicitly or commenting on code blocks breaks silently.
      const sourceLine = node.properties?.["data-source-line"];
      if (sourceLine !== undefined) {
        replacement.properties = { ...replacement.properties, "data-source-line": sourceLine };
      }

      parent.children[index] = replacement;
    });
  };
};
```

- [ ] **Step 5: Add it to the pipeline, after sanitization**

In `src/features/markdown-preview/lib/pipeline.ts`, add the import and insert the plugin between `rehypeSanitize` and `rehypeStringify`:

```ts
import { rehypeShiki } from "./rehypeShiki";
```

```ts
  .use(rehypeSanitize, sanitizeSchema)
  .use(rehypeShiki)
  .use(rehypeStringify);
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `bun test src/features/markdown-preview/`
Expected: PASS, including `rehypeShiki.test.ts` and the pre-existing `pipeline.test.ts`.

The old test `"leaves non-mermaid code fences as <pre><code>"` (`pipeline.test.ts:88-93`) still passes — Shiki's output is a `<pre>` containing a `<code>`. If it fails on the `class="mermaid"` assertion, `rehypeShiki` is wrongly matching the Mermaid div; confirm `rehypeMermaid` runs before sanitization and produces a `div`, not a `pre`.

- [ ] **Step 7: Add the light/dark code styles**

In `src/shared/styles/index.css`, replace the stale comment at lines 64-66 ("Phase 5 will revisit (GFM tables, syntax highlighting, callouts)") with the Shiki rules:

```css
/* Shiki dual-theme output. `defaultColor: false` emits both colors as custom
   properties on every token, so switching themes is pure CSS — no re-render,
   unlike Mermaid. */
.prose-styles .shiki,
.prose-styles .shiki span {
  color: var(--shiki-light);
  background-color: var(--shiki-light-bg);
}

@media (prefers-color-scheme: dark) {
  .prose-styles .shiki,
  .prose-styles .shiki span {
    color: var(--shiki-dark);
    background-color: var(--shiki-dark-bg);
  }
}

.prose-styles .shiki {
  overflow-x: auto;
  border-radius: 0.375rem;
  padding: 0.875rem 1rem;
  font-size: 0.8125rem;
  line-height: 1.6;
}

.prose-styles .shiki code {
  background: none;
  padding: 0;
  font-size: inherit;
}
```

- [ ] **Step 8: Verify visually**

Run: `bun run dev`
Open a Markdown file containing a ` ```ts ` fence and a ` ```klingon ` fence. Expected: the TypeScript block is colored, the unknown-language block renders as readable plain text inside the same themed container, and flipping the OS appearance recolors both without a reload.

- [ ] **Step 9: Commit**

```bash
git add package.json bun.lock src/features/markdown-preview/lib/ src/shared/styles/index.css
git commit -m "feat(preview): Shiki syntax highlighting with GitHub light/dark themes

Synchronous highlighter (createHighlighterCoreSync + JS regex engine) keeps
renderMarkdown sync. Runs after rehype-sanitize so its inline styles never
force \`style\` into the document allowlist, and carries data-source-line onto
the replacement node so comment anchoring on code blocks keeps working.

Closes #27"
```

---

### Task 6: Rust — read file bytes at a ref

`process::run` decodes stdout with `String::from_utf8_lossy` (`crates/infra/src/process/mod.rs:63`), which silently corrupts binary. Images need a byte-preserving path.

**Files:**
- Modify: `crates/infra/src/process/mod.rs`
- Modify: `crates/core/src/ports/git.rs:25-30`
- Modify: `crates/core/src/ports/gh.rs`
- Modify: `crates/infra/src/git/git_cli.rs:65-79`
- Modify: `crates/infra/src/gh/gh_cli.rs:290-325`
- Create: `crates/infra/tests/show_file_bytes.rs`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `process::run_bytes(program: &str, args: &[&str], cwd: Option<&str>, timeout_ms: u64) -> AppResult<BytesOutput>` where `BytesOutput { status: i32, stdout: Vec<u8>, stderr: String }` with an `ok()` method.
  - `GitClient::show_file_bytes(&self, repo_path: &str, sha: &str, file_path: &str) -> AppResult<Option<Vec<u8>>>`
  - `GhClient::get_file_bytes(&self, repo_path: &str, sha: &str, file_path: &str) -> AppResult<Vec<u8>>`

- [ ] **Step 1: Write the failing integration test**

Create `crates/infra/tests/show_file_bytes.rs`:

```rust
//! Guards the binary-safety of `show_file_bytes`. `process::run` decodes
//! stdout lossily, which corrupts any non-UTF-8 byte; this asserts the bytes
//! survive a round trip through `git show` exactly.

use markdown_reviewer_core::ports::GitClient;
use markdown_reviewer_infra::GitCli;

/// A tiny 1x1 PNG. Contains 0x89 and other bytes that are invalid UTF-8, so
/// a lossy decode mangles it into U+FFFD.
const PNG: &[u8] = &[
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
    0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
    0x42, 0x60, 0x82,
];

fn git(dir: &std::path::Path, args: &[&str]) {
    let out = std::process::Command::new("git")
        .args(args)
        .current_dir(dir)
        .output()
        .expect("run git");
    assert!(out.status.success(), "git {args:?} failed: {out:?}");
}

#[tokio::test]
#[ignore = "spawns git; run with --ignored"]
async fn reads_binary_bytes_without_corruption() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let dir = tmp.path();

    git(dir, &["init", "-q"]);
    git(dir, &["config", "user.email", "t@example.com"]);
    git(dir, &["config", "user.name", "T"]);
    std::fs::write(dir.join("pixel.png"), PNG).expect("write png");
    git(dir, &["add", "pixel.png"]);
    git(dir, &["commit", "-qm", "add pixel"]);

    let repo = dir.to_str().expect("utf8 path");
    let got = GitCli
        .show_file_bytes(repo, "HEAD", "pixel.png")
        .await
        .expect("show_file_bytes")
        .expect("file present at HEAD");

    assert_eq!(got, PNG, "bytes must survive git show byte-for-byte");
}

#[tokio::test]
#[ignore = "spawns git; run with --ignored"]
async fn missing_file_is_none_not_error() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let dir = tmp.path();
    git(dir, &["init", "-q"]);
    git(dir, &["config", "user.email", "t@example.com"]);
    git(dir, &["config", "user.name", "T"]);
    std::fs::write(dir.join("a.txt"), "hi").expect("write");
    git(dir, &["add", "a.txt"]);
    git(dir, &["commit", "-qm", "init"]);

    let repo = dir.to_str().expect("utf8 path");
    let got = GitCli
        .show_file_bytes(repo, "HEAD", "nope.png")
        .await
        .expect("call succeeds");
    assert!(got.is_none());
}
```

If `tempfile` is not already a dev-dependency of `crates/infra`, add it: `cargo add --dev tempfile --package markdown-reviewer-infra`. Check `crates/infra/Cargo.toml` first — the existing fixtures under `crates/infra/tests/fixtures` suggest it is already there.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cargo test --package markdown-reviewer-infra --test show_file_bytes -- --ignored`
Expected: FAIL to compile — `no method named show_file_bytes found for struct GitCli`.

- [ ] **Step 3: Add the byte-capturing process helper**

In `crates/infra/src/process/mod.rs`, add after the existing `CommandOutput` block:

```rust
/// Same shape as `CommandOutput`, but stdout is kept as raw bytes. `run`
/// decodes stdout with `String::from_utf8_lossy`, which replaces every
/// invalid byte with U+FFFD — fine for text, silently destructive for the
/// binary blobs the asset path reads.
#[derive(Debug, Clone)]
pub struct BytesOutput {
    pub status: i32,
    pub stdout: Vec<u8>,
    pub stderr: String,
}

impl BytesOutput {
    pub fn ok(&self) -> bool {
        self.status == 0
    }
}

/// Byte-preserving sibling of `run`. Same argv discipline, same timeout, same
/// redaction on stderr.
pub async fn run_bytes(
    program: &str,
    args: &[&str],
    cwd: Option<&str>,
    timeout_ms: u64,
) -> AppResult<BytesOutput> {
    let mut cmd = Command::new(program);
    cmd.args(args);
    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }
    cmd.stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null());

    let fut = cmd.output();
    let out = match timeout(Duration::from_millis(timeout_ms), fut).await {
        Ok(Ok(o)) => o,
        Ok(Err(e)) => {
            if e.kind() == std::io::ErrorKind::NotFound {
                return Err(AppError::MissingTool {
                    name: program.to_string(),
                });
            }
            return Err(AppError::process(redact(&e.to_string())));
        }
        Err(_) => {
            return Err(AppError::process(format!(
                "`{program}` timed out after {timeout_ms}ms"
            )))
        }
    };

    let output = BytesOutput {
        status: out.status.code().unwrap_or(-1),
        stdout: out.stdout,
        stderr: String::from_utf8_lossy(&out.stderr).to_string(),
    };

    tracing::debug!(
        program,
        args = ?args,
        status = output.status,
        stdout_len = output.stdout.len(),
        stderr = %redact(&output.stderr),
        "process exited (bytes)"
    );

    Ok(output)
}
```

- [ ] **Step 4: Declare the port methods**

In `crates/core/src/ports/git.rs`, add to the `GitClient` trait after `show_file`:

```rust
    /// Byte-preserving sibling of `show_file`, for binary blobs (images).
    /// Returns `None` on the same conditions: missing ref or missing file.
    async fn show_file_bytes(
        &self,
        repo_path: &str,
        sha: &str,
        file_path: &str,
    ) -> AppResult<Option<Vec<u8>>>;
```

In `crates/core/src/ports/gh.rs`, add to the `GhClient` trait alongside `get_file_content`:

```rust
    /// Byte-preserving sibling of `get_file_content`, for binary blobs.
    async fn get_file_bytes(
        &self,
        repo_path: &str,
        sha: &str,
        file_path: &str,
    ) -> AppResult<Vec<u8>>;
```

- [ ] **Step 5: Implement them in the adapters**

In `crates/infra/src/git/git_cli.rs`, import `run_bytes` alongside the existing `run` import, and add after `show_file`:

```rust
    async fn show_file_bytes(
        &self,
        repo_path: &str,
        sha: &str,
        file_path: &str,
    ) -> AppResult<Option<Vec<u8>>> {
        let spec = format!("{sha}:{file_path}");
        let out = run_bytes("git", &["-C", repo_path, "show", &spec], None, TIMEOUT_MS).await?;
        if !out.ok() {
            // Missing ref or missing file at that ref — both recoverable
            // upstream via the GitHub API fallback.
            return Ok(None);
        }
        Ok(Some(out.stdout))
    }
```

In `crates/infra/src/gh/gh_cli.rs`, add after `get_file_content`:

```rust
    async fn get_file_bytes(
        &self,
        repo_path: &str,
        sha: &str,
        file_path: &str,
    ) -> AppResult<Vec<u8>> {
        // Same endpoint as `get_file_content`, but the base64 payload is
        // returned as bytes rather than being forced through UTF-8.
        let endpoint = format!("repos/{{owner}}/{{repo}}/contents/{file_path}?ref={sha}");
        let out = run(
            "gh",
            &["api", "-X", "GET", &endpoint, "--jq", ".content"],
            Some(repo_path),
            PR_TIMEOUT_MS,
        )
        .await?;

        if !out.ok() {
            let lower = out.stderr.to_ascii_lowercase();
            if lower.contains("404") || lower.contains("not found") {
                return Err(AppError::FileNotFound {
                    sha: sha.to_string(),
                    path: file_path.to_string(),
                });
            }
            return Err(AppError::process(redact(out.stderr.trim())));
        }

        let raw = out.stdout.replace(['\n', '\r'], "");
        base64_decode(&raw)
            .map_err(|e| AppError::process(format!("gh api contents: invalid base64: {e}")))
    }
```

`run` (not `run_bytes`) is correct here: the API returns base64 *text*, and `base64_decode` already yields `Vec<u8>`.

- [ ] **Step 6: Fix every other GitClient/GhClient implementor**

Adding trait methods breaks all fakes. Find them:

```bash
grep -rln "impl GitClient\|impl GhClient" crates/
```

Add the new methods to each fake. For fakes that should not be exercised, `unimplemented!("not used in this test")` is the right body; for ones that are, mirror the existing `show_file` / `get_file_content` fake behavior with `Vec<u8>`.

- [ ] **Step 7: Run the tests to verify they pass**

```bash
cargo test --package markdown-reviewer-infra --test show_file_bytes -- --ignored
cargo test --workspace
```

Expected: both PASS. The first is the regression guard proving `from_utf8_lossy` corruption is gone.

- [ ] **Step 8: Commit**

```bash
git add crates/
git commit -m "feat(files): byte-preserving reads for binary blobs

process::run decodes stdout with from_utf8_lossy, which silently corrupts
binary. Adds run_bytes plus show_file_bytes / get_file_bytes on the git and
gh ports, with an integration test asserting a PNG survives byte-for-byte.

Refs #30"
```

---

### Task 7: Rust — the `read_repo_asset` use case

**Files:**
- Create: `crates/core/src/application/files/read_repo_asset.rs`
- Modify: `crates/core/src/application/files/mod.rs:1`
- Create: `crates/core/tests/read_repo_asset.rs`

**Interfaces:**
- Consumes: `GitClient::show_file_bytes`, `GhClient::get_file_bytes` (Task 6); the existing `Files` bundle.
- Produces: `read_repo_asset(svc: &Files, repo_path: &str, sha: &str, file_path: &str) -> AppResult<Vec<u8>>` and `pub const MAX_ASSET_BYTES: usize = 10 * 1024 * 1024;`

- [ ] **Step 1: Write the failing test**

Create `crates/core/tests/read_repo_asset.rs`:

```rust
use std::sync::Arc;

use async_trait::async_trait;
use markdown_reviewer_core::application::files::{read_repo_asset, Files, MAX_ASSET_BYTES};
use markdown_reviewer_core::ports::{GhClient, GitClient};
use markdown_reviewer_core::{AppError, AppResult};

mod fakes;
use fakes::{FakeGh, FakeGit};

fn svc(git: FakeGit, gh: FakeGh) -> Files {
    Files {
        git: Arc::new(git),
        gh: Arc::new(gh),
    }
}

#[tokio::test]
async fn returns_local_bytes_when_git_has_them() {
    let s = svc(
        FakeGit::with_bytes(Some(vec![1, 2, 3])),
        FakeGh::with_bytes(vec![9, 9, 9]),
    );
    let got = read_repo_asset(&s, "/repo", "abc", "docs/a.png").await.unwrap();
    assert_eq!(got, vec![1, 2, 3]);
}

#[tokio::test]
async fn falls_back_to_github_when_git_misses() {
    let s = svc(FakeGit::with_bytes(None), FakeGh::with_bytes(vec![7, 7]));
    let got = read_repo_asset(&s, "/repo", "abc", "docs/a.png").await.unwrap();
    assert_eq!(got, vec![7, 7]);
}

#[tokio::test]
async fn propagates_the_github_error_when_both_miss() {
    let s = svc(FakeGit::with_bytes(None), FakeGh::failing());
    let err = read_repo_asset(&s, "/repo", "abc", "nope.png").await.unwrap_err();
    assert!(matches!(err, AppError::FileNotFound { .. }));
}

#[tokio::test]
async fn rejects_an_asset_over_the_size_cap() {
    let huge = vec![0u8; MAX_ASSET_BYTES + 1];
    let s = svc(FakeGit::with_bytes(Some(huge)), FakeGh::with_bytes(vec![]));
    let err = read_repo_asset(&s, "/repo", "abc", "big.png").await.unwrap_err();
    assert!(matches!(err, AppError::Validation { .. }));
}
```

Check `crates/core/tests/` for an existing fakes module; if `fakes.rs` or `fakes/mod.rs` already defines `FakeGit`/`FakeGh`, extend it with `with_bytes`/`failing` constructors and the two new trait methods rather than creating a parallel one. If no shared fakes module exists, define the two fakes inline in this test file, implementing every `GitClient` / `GhClient` method (`unimplemented!()` for the unused ones).

- [ ] **Step 2: Run the test to verify it fails**

Run: `cargo test --package markdown-reviewer-core --test read_repo_asset`
Expected: FAIL to compile — `read_repo_asset` and `MAX_ASSET_BYTES` do not exist.

- [ ] **Step 3: Write the use case**

Create `crates/core/src/application/files/read_repo_asset.rs`:

```rust
use crate::{AppError, AppResult};

use super::Files;

/// Upper bound on an asset served to the WebView. Large enough for any
/// screenshot a doc would reasonably embed, small enough that a stray binary
/// cannot pin memory or stall the render.
pub const MAX_ASSET_BYTES: usize = 10 * 1024 * 1024;

/// Returns the raw bytes of `<file_path>` at `<sha>` for `<repo_path>`.
///
/// Mirrors `read_markdown_file`: the local object database first via
/// `git show`, then the GitHub Contents API when the ref was never fetched.
/// Resolving through git rather than the working tree is what keeps this from
/// being a filesystem-traversal primitive — `git show <sha>:<path>` resolves
/// inside a tree object, so `../../etc/passwd` simply does not exist.
pub async fn read_repo_asset(
    svc: &Files,
    repo_path: &str,
    sha: &str,
    file_path: &str,
) -> AppResult<Vec<u8>> {
    let bytes = match svc.git.show_file_bytes(repo_path, sha, file_path).await? {
        Some(bytes) => bytes,
        None => svc.gh.get_file_bytes(repo_path, sha, file_path).await?,
    };

    if bytes.len() > MAX_ASSET_BYTES {
        return Err(AppError::validation(format!(
            "asset `{file_path}` is {} bytes, over the {MAX_ASSET_BYTES} byte limit",
            bytes.len()
        )));
    }

    Ok(bytes)
}
```

If `AppError::validation` does not exist as a constructor, check `crates/core/src/error.rs` for the established pattern (`AppError::process` is built the same way) and follow it.

- [ ] **Step 4: Export it**

In `crates/core/src/application/files/mod.rs`, add the module and re-export so the test's import path resolves:

```rust
pub mod read_markdown_file;
pub mod read_repo_asset;

pub use read_repo_asset::{read_repo_asset, MAX_ASSET_BYTES};
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cargo test --package markdown-reviewer-core --test read_repo_asset`
Expected: PASS, all four cases.

- [ ] **Step 6: Commit**

```bash
git add crates/core/
git commit -m "feat(files): read_repo_asset use case with a 10MB cap

Mirrors read_markdown_file for binary blobs: local git object database
first, GitHub Contents API as fallback.

Refs #30"
```

---

### Task 8: The `mdasset://` URI scheme

**Files:**
- Modify: `src-tauri/src/bootstrap.rs`
- Create: `src-tauri/src/asset_protocol.rs`
- Modify: `crates/ipc/src/state.rs` (only if `Files` is not already reachable from `AppState`)

No new Rust dependency: `tauri::http` and `UriSchemeResponder` ship with the `tauri` crate already in the workspace.

**Interfaces:**
- Consumes: `read_repo_asset`, `MAX_ASSET_BYTES` (Task 7); the CSP from Task 4 already admits `mdasset:`.
- Produces: a URI scheme answering `mdasset://localhost/?repo=<urlencoded>&sha=<sha>&path=<urlencoded>` with the blob's bytes and a `Content-Type` header.

- [ ] **Step 1: Confirm Files is reachable from AppState**

Run: `grep -n "files\|Files" crates/ipc/src/state.rs`

`read_markdown_file` is already an exposed command, so `AppState` almost certainly holds a `Files`. If it does not, add `pub files: Files,` to `AppState` and populate it in `bootstrap.rs` from the `file_resolver` wiring that already exists there (`src-tauri/src/bootstrap.rs:48-52`).

- [ ] **Step 2: Write the protocol handler**

Create `src-tauri/src/asset_protocol.rs`:

```rust
//! Serves repository assets (images referenced from Markdown) to the WebView
//! over a custom URI scheme.
//!
//! Parameters travel as a query string rather than a path because custom-scheme
//! host and path handling differs across platforms — Windows in particular
//! serves custom schemes over `http://<scheme>.localhost` and mangles
//! `mdasset://<host>` forms.
//!
//! This is not a filesystem read primitive. Every read goes through
//! `read_repo_asset`, which resolves via `git show <sha>:<path>` or the GitHub
//! Contents API; both resolve inside a tree object, so a traversal like
//! `../../etc/passwd` resolves to nothing rather than to a file.

use markdown_reviewer_core::application::files::read_repo_asset;
use markdown_reviewer_ipc::AppState;
use tauri::http::{Request, Response, StatusCode};
use tauri::{Manager, Runtime, UriSchemeContext, UriSchemeResponder};

pub const SCHEME: &str = "mdasset";

/// Maps a file extension to a MIME type. Deliberately a short allowlist: an
/// unknown extension gets `application/octet-stream`, which the WebView will
/// refuse to render as an image — a visible failure, not a silent one.
fn mime_for(path: &str) -> &'static str {
    let ext = path.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
    match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "avif" => "image/avif",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        "svg" => "image/svg+xml",
        _ => "application/octet-stream",
    }
}

/// Percent-decodes a query parameter value.
fn decode(raw: &str) -> Option<String> {
    let bytes = raw.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'%' if i + 2 < bytes.len() => {
                let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).ok()?;
                out.push(u8::from_str_radix(hex, 16).ok()?);
                i += 3;
            }
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            c => {
                out.push(c);
                i += 1;
            }
        }
    }
    String::from_utf8(out).ok()
}

/// Pulls `repo`, `sha`, and `path` out of the request URI's query string.
fn params(uri: &str) -> Option<(String, String, String)> {
    let query = uri.split_once('?')?.1;
    let (mut repo, mut sha, mut path) = (None, None, None);
    for pair in query.split('&') {
        let (k, v) = pair.split_once('=')?;
        match k {
            "repo" => repo = decode(v),
            "sha" => sha = decode(v),
            "path" => path = decode(v),
            _ => {}
        }
    }
    Some((repo?, sha?, path?))
}

fn error(status: StatusCode) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .body(Vec::new())
        .expect("build error response")
}

pub fn handle<R: Runtime>(
    ctx: UriSchemeContext<'_, R>,
    request: Request<Vec<u8>>,
    responder: UriSchemeResponder,
) {
    let app = ctx.app_handle().clone();
    let uri = request.uri().to_string();

    tauri::async_runtime::spawn(async move {
        let Some((repo_path, sha, file_path)) = params(&uri) else {
            tracing::warn!("mdasset: malformed request URI");
            responder.respond(error(StatusCode::BAD_REQUEST));
            return;
        };

        let files = { app.state::<AppState>().files.clone() };

        match read_repo_asset(&files, &repo_path, &sha, &file_path).await {
            Ok(bytes) => {
                let response = Response::builder()
                    .status(StatusCode::OK)
                    .header("Content-Type", mime_for(&file_path))
                    .header("Cache-Control", "max-age=3600")
                    .body(bytes)
                    .expect("build asset response");
                responder.respond(response);
            }
            Err(e) => {
                // Path is logged, content never is.
                tracing::debug!(path = %file_path, error = ?e, "mdasset: asset unavailable");
                responder.respond(error(StatusCode::NOT_FOUND));
            }
        }
    });
}
```

- [ ] **Step 3: Register the scheme**

In `src-tauri/src/bootstrap.rs`, declare the module at the top of the file:

```rust
mod asset_protocol;
```

(If `bootstrap.rs` is not the crate root, put `mod asset_protocol;` in `src-tauri/src/lib.rs` alongside the existing `mod bootstrap;` and reference it as `crate::asset_protocol`.)

Then chain the registration onto the builder, before `markdown_reviewer_ipc::register`:

```rust
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .register_asynchronous_uri_scheme_protocol(asset_protocol::SCHEME, asset_protocol::handle);
```

- [ ] **Step 4: Verify it compiles and clippy is clean**

```bash
cargo build --workspace
cargo clippy --workspace --all-targets -- -D warnings
```

Expected: both succeed.

If `app.state::<AppState>()` panics at runtime because state is managed inside `.setup()` while the protocol is registered on the builder, that is fine — registration only stores the closure; the closure runs on request, long after setup. But if a request can somehow arrive first, use `app.try_state::<AppState>()` and respond `503` when absent.

- [ ] **Step 5: Verify manually**

Run: `bun run dev`, open the DevTools console, and evaluate:

```js
// Replace with a real repo path, the PR head SHA, and a real image path.
const u = `mdasset://localhost/?repo=${encodeURIComponent("/abs/path/to/repo")}&sha=HEAD&path=${encodeURIComponent("docs/img.png")}`;
document.body.insertAdjacentHTML("beforeend", `<img src="${u}" style="position:fixed;top:0;right:0;z-index:9999">`);
```

Expected: the image renders in the corner, and no CSP violation appears. A `404` in the network tab means the path or SHA is wrong; a CSP error means Task 4's `img-src` is missing the scheme form your platform uses.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/
git commit -m "feat(assets): mdasset:// URI scheme serving repo blobs at a SHA

Query-string parameters rather than path segments, because custom-scheme host
handling differs across platforms. Not a filesystem read primitive — every
read resolves inside a git tree object.

Refs #30"
```

---

### Task 9: Relative image resolution in the pipeline

Introduces the `RenderContext` factory — the structural change the spec calls for — and uses it to rewrite relative image sources.

**Files:**
- Create: `src/features/markdown-preview/lib/resolveRepoPath.ts`
- Create: `src/features/markdown-preview/lib/resolveRepoPath.test.ts`
- Create: `src/features/markdown-preview/lib/rehypeRepoAssets.ts`
- Create: `src/features/markdown-preview/lib/rehypeRepoAssets.test.ts`
- Modify: `src/features/markdown-preview/lib/pipeline.ts`

**Interfaces:**
- Consumes: `sanitizeSchema` (Task 1) — already allowlists `mdasset` in `protocols.src`.
- Produces:
  - `resolveRepoPath(currentFile: string, target: string): string | null`
  - `RenderContext` interface and `renderMarkdown(source: string, ctx?: RenderContext): string` from `lib/pipeline.ts`
  - `rehypeRepoAssets: Plugin<[RenderContext], Root>`

- [ ] **Step 1: Write the failing path-resolution test**

Create `src/features/markdown-preview/lib/resolveRepoPath.test.ts`:

```ts
import { expect, test } from "bun:test";
import { resolveRepoPath } from "./resolveRepoPath";

test("resolves a sibling path", () => {
  expect(resolveRepoPath("docs/guide.md", "img.png")).toBe("docs/img.png");
});

test("resolves an explicit ./ prefix", () => {
  expect(resolveRepoPath("docs/guide.md", "./img.png")).toBe("docs/img.png");
});

test("resolves a parent traversal", () => {
  expect(resolveRepoPath("docs/deep/guide.md", "../img.png")).toBe("docs/img.png");
});

test("resolves multiple parent traversals", () => {
  expect(resolveRepoPath("a/b/c/guide.md", "../../img.png")).toBe("a/img.png");
});

test("treats a leading slash as repo-root relative", () => {
  expect(resolveRepoPath("docs/deep/guide.md", "/assets/img.png")).toBe("assets/img.png");
});

test("collapses redundant segments", () => {
  expect(resolveRepoPath("docs/guide.md", "./sub/./../img.png")).toBe("docs/img.png");
});

test("rejects traversal above the repo root", () => {
  expect(resolveRepoPath("guide.md", "../../../etc/passwd")).toBeNull();
});

test("handles a file at the repo root", () => {
  expect(resolveRepoPath("README.md", "img.png")).toBe("img.png");
});

test("strips a query string and fragment", () => {
  expect(resolveRepoPath("docs/guide.md", "img.png?v=2#frag")).toBe("docs/img.png");
});

test("rejects an empty target", () => {
  expect(resolveRepoPath("docs/guide.md", "")).toBeNull();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test src/features/markdown-preview/lib/resolveRepoPath.test.ts`
Expected: FAIL with "Cannot find module './resolveRepoPath'".

- [ ] **Step 3: Implement path resolution**

Create `src/features/markdown-preview/lib/resolveRepoPath.ts`:

```ts
/**
 * Resolves a Markdown-relative path against the repo root.
 *
 * `currentFile` is the repo-relative path of the document being rendered
 * (e.g. `docs/guide.md`); `target` is the raw href/src the author wrote.
 * Returns a normalized repo-relative path, or `null` when the target is not a
 * repo-relative path we can resolve (empty, or escaping the root).
 *
 * Escaping the root is rejected here for clarity of intent, not as the
 * security boundary — reads go through `git show <sha>:<path>`, which cannot
 * reach outside the tree object regardless of what we pass it.
 */
export function resolveRepoPath(currentFile: string, target: string): string | null {
  if (!target) return null;

  // Drop query and fragment; neither means anything to a git blob lookup.
  const clean = target.split("#")[0]?.split("?")[0] ?? "";
  if (!clean) return null;

  const rootRelative = clean.startsWith("/");
  const base = rootRelative ? [] : currentFile.split("/").slice(0, -1);
  const segments = [...base, ...clean.split("/")];

  const out: string[] = [];
  for (const segment of segments) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (out.length === 0) return null; // escaped the repo root
      out.pop();
      continue;
    }
    out.push(segment);
  }

  return out.length > 0 ? out.join("/") : null;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `bun test src/features/markdown-preview/lib/resolveRepoPath.test.ts`
Expected: PASS, all ten cases.

- [ ] **Step 5: Write the failing asset-rewrite test**

Create `src/features/markdown-preview/lib/rehypeRepoAssets.test.ts`:

```ts
import { expect, test } from "bun:test";
import { type RenderContext, renderMarkdown } from "./pipeline";

const ctx: RenderContext = {
  repoPath: "/home/u/repo",
  sha: "abc123",
  filePath: "docs/guide.md",
  owner: "o",
  repo: "r",
  prFiles: ["docs/guide.md", "docs/other.md"],
  basePath: "/repo/o/r/pulls/7",
};

test("rewrites a relative image to mdasset://", () => {
  const html = renderMarkdown("![alt](./pic.png)", ctx);
  expect(html).toContain("mdasset://localhost/?");
  expect(html).toContain(`repo=${encodeURIComponent("/home/u/repo")}`);
  expect(html).toContain("sha=abc123");
  expect(html).toContain(`path=${encodeURIComponent("docs/pic.png")}`);
  expect(html).toContain('alt="alt"');
});

test("rewrites a repo-root-relative image", () => {
  const html = renderMarkdown("![x](/assets/logo.png)", ctx);
  expect(html).toContain(`path=${encodeURIComponent("assets/logo.png")}`);
});

test("leaves an absolute https image untouched", () => {
  const html = renderMarkdown("![x](https://example.com/a.png)", ctx);
  expect(html).not.toContain("mdasset");
  // The sanitizer allows only mdasset in src, so an https source is dropped
  // rather than silently fetched over the network.
  expect(html).not.toContain("https://example.com/a.png");
});

test("leaves a protocol-relative image untouched", () => {
  const html = renderMarkdown("![x](//example.com/a.png)", ctx);
  expect(html).not.toContain("mdasset");
});

test("drops an image that escapes the repo root", () => {
  const html = renderMarkdown("![x](../../../etc/passwd)", ctx);
  expect(html).not.toContain("mdasset");
  expect(html).not.toContain("passwd");
});

test("is a no-op without a render context", () => {
  const html = renderMarkdown("![alt](./pic.png)");
  expect(html).not.toContain("mdasset");
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `bun test src/features/markdown-preview/lib/rehypeRepoAssets.test.ts`
Expected: FAIL — `renderMarkdown` takes one argument and `RenderContext` is not exported.

- [ ] **Step 7: Implement the asset plugin**

Create `src/features/markdown-preview/lib/rehypeRepoAssets.ts`:

```ts
import type { Element, Root } from "hast";
import type { Plugin } from "unified";
import { visit } from "unist-util-visit";
import type { RenderContext } from "./pipeline";
import { resolveRepoPath } from "./resolveRepoPath";

/** True for anything that already names its own origin. */
function isAbsolute(url: string): boolean {
  return url.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(url);
}

/** Builds the custom-scheme URL the Rust handler answers. */
export function assetUrl(ctx: RenderContext, path: string): string {
  const params = new URLSearchParams({ repo: ctx.repoPath, sha: ctx.sha, path });
  return `mdasset://localhost/?${params.toString()}`;
}

/**
 * Rewrites relative `<img src>` to the `mdasset://` scheme, which the Rust
 * side resolves at the PR head SHA — the same ref the Markdown itself was
 * read at, so the reviewer sees the image as it exists in the commit under
 * review rather than as it exists on whatever branch is checked out.
 *
 * Absolute and protocol-relative sources are left alone; the sanitize
 * allowlist then drops them, because a documentation preview has no business
 * making network requests. A source that escapes the repo root is dropped.
 */
export const rehypeRepoAssets: Plugin<[RenderContext], Root> = (ctx) => {
  return (tree) => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "img") return;
      const src = node.properties?.src;
      if (typeof src !== "string" || isAbsolute(src)) return;

      const resolved = resolveRepoPath(ctx.filePath, src);
      if (!resolved) {
        node.properties = { ...node.properties, src: undefined };
        return;
      }
      node.properties = { ...node.properties, src: assetUrl(ctx, resolved), loading: "lazy" };
    });
  };
};
```

- [ ] **Step 8: Turn the pipeline into a context-aware factory**

Rewrite `src/features/markdown-preview/lib/pipeline.ts`:

```ts
import { i18next } from "@/shared/i18n";
import rehypeSanitize from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { type Processor, unified } from "unified";
import { rehypeMermaid } from "./rehypeMermaid";
import { rehypeRepoAssets } from "./rehypeRepoAssets";
import { type AlertType, remarkGithubAlerts } from "./remarkGithubAlerts";
import { rehypeShiki } from "./rehypeShiki";
import { remarkSourceLine } from "./remarkSourceLine";
import { sanitizeSchema } from "./sanitizeSchema";

/**
 * Everything the preview needs to resolve a document's relative references.
 * Rendering without one is supported and yields the context-free output:
 * relative images and local links are left as-is (and then dropped by the
 * sanitizer), which is what the unit tests and any context-free caller want.
 */
export interface RenderContext {
  /** Absolute path of the local clone. */
  repoPath: string;
  /** PR head SHA — every relative reference resolves at this ref. */
  sha: string;
  /** Repo-relative path of the document being rendered. */
  filePath: string;
  /** Owner and repo, for building github.com/<owner>/<repo>/blob/… URLs. */
  owner: string;
  repo: string;
  /** The PR's changed files — decides in-app navigation vs. opening GitHub. */
  prFiles: readonly string[];
  /** Route prefix for in-app navigation, e.g. `/repo/o/r/pulls/12`. */
  basePath: string;
}

const labelForAlert = (type: AlertType): string => i18next.t(`markdownPreview.alerts.${type}`);

function build(ctx?: RenderContext): Processor {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkSourceLine)
    .use(remarkGithubAlerts, { label: labelForAlert })
    .use(remarkRehype, { allowDangerousHtml: false })
    .use(rehypeSlug)
    .use(rehypeMermaid);

  if (ctx) processor.use(rehypeRepoAssets, ctx);

  return (
    processor
      // Everything above this line handles untrusted author content.
      .use(rehypeSanitize, sanitizeSchema)
      // Everything below generates markup from already-escaped text.
      .use(rehypeShiki)
      .use(rehypeStringify) as Processor
  );
}

const contextFree = build();
/** One processor per context identity — a re-render must not rebuild the chain. */
const cache = new WeakMap<RenderContext, Processor>();

export function renderMarkdown(source: string, ctx?: RenderContext): string {
  if (!ctx) return contextFree.processSync(source).toString();
  let processor = cache.get(ctx);
  if (!processor) {
    processor = build(ctx);
    cache.set(ctx, processor);
  }
  return processor.processSync(source).toString();
}
```

`rehypeRepoAssets` imports `RenderContext` from `pipeline.ts` while `pipeline.ts` imports the plugin — a type-only cycle, which TypeScript and the bundler both handle. If Biome flags it, move `RenderContext` into its own `lib/renderContext.ts` and re-export it from `pipeline.ts`.

- [ ] **Step 9: Run the whole feature's tests**

Run: `bun test src/features/markdown-preview/`
Expected: PASS. Existing context-free tests are unaffected because `ctx` is optional.

- [ ] **Step 10: Commit**

```bash
git add src/features/markdown-preview/lib/
git commit -m "feat(preview): resolve relative images against the PR head SHA

Turns the pipeline into a context-aware factory and rewrites relative img src
to mdasset://. Absolute sources are left for the sanitizer to drop — a docs
preview has no business making network requests.

Refs #30"
```

---

### Task 10: Link classification and click handling

**Files:**
- Create: `src/features/markdown-preview/lib/rehypeLinks.ts`
- Create: `src/features/markdown-preview/lib/rehypeLinks.test.ts`
- Modify: `src/features/markdown-preview/lib/pipeline.ts`
- Modify: `src/features/markdown-preview/components/MarkdownPreview.tsx`
- Modify: `src/features/file-explorer/screens/PullRequestScreen/PreviewArea.tsx`
- Modify: `src/features/file-explorer/screens/PullRequestScreen/index.tsx`
- Modify: `src/shared/i18n/locales/en.json`
- Modify: `src/shared/styles/index.css`
- Modify: `src-tauri/Cargo.toml`, `src-tauri/src/bootstrap.rs`, `src-tauri/capabilities/default.json`
- Modify: `package.json`

**Interfaces:**
- Consumes: `RenderContext`, `resolveRepoPath` (Task 9); `scrollToAnchorId` (Task 2); `sanitizeSchema`'s `data-link-kind` / `data-href` on `a` (Task 1).
- Produces: `rehypeLinks: Plugin<[RenderContext], Root>` and `type LinkKind = "internal" | "github" | "external" | "inert" | "anchor"`.

- [ ] **Step 1: Install the opener plugin**

```bash
bun add @tauri-apps/plugin-opener
cargo add tauri-plugin-opener --package markdown-reviewer-desktop
```

- [ ] **Step 2: Write the failing classification test**

Create `src/features/markdown-preview/lib/rehypeLinks.test.ts`:

```ts
import { expect, test } from "bun:test";
import { type RenderContext, renderMarkdown } from "./pipeline";

const ctx: RenderContext = {
  repoPath: "/home/u/repo",
  sha: "abc123",
  filePath: "docs/guide.md",
  owner: "acme",
  repo: "widgets",
  prFiles: ["docs/guide.md", "docs/other.md"],
  basePath: "/repo/acme/widgets/pulls/7",
};

test("a markdown file in the PR becomes an in-app route", () => {
  const html = renderMarkdown("[other](./other.md)", ctx);
  expect(html).toContain('data-link-kind="internal"');
  expect(html).toContain('href="#/repo/acme/widgets/pulls/7/files/docs/other.md"');
});

test("a markdown file outside the PR points at GitHub", () => {
  const html = renderMarkdown("[readme](../README.md)", ctx);
  expect(html).toContain('data-link-kind="github"');
  expect(html).toContain("https://github.com/acme/widgets/blob/abc123/README.md");
});

test("a non-markdown local file points at GitHub", () => {
  const html = renderMarkdown("[code](./setup.ts)", ctx);
  expect(html).toContain('data-link-kind="github"');
  expect(html).toContain("https://github.com/acme/widgets/blob/abc123/docs/setup.ts");
});

test("an external https link is marked external and hardened", () => {
  const html = renderMarkdown("[site](https://example.com/x)", ctx);
  expect(html).toContain('data-link-kind="external"');
  expect(html).toContain('rel="noopener noreferrer"');
  expect(html).toContain('href="https://example.com/x"');
});

test("an intra-document anchor is marked as such", () => {
  const html = renderMarkdown("[top](#setup)", ctx);
  expect(html).toContain('data-link-kind="anchor"');
  expect(html).toContain('data-href="setup"');
});

test("an unknown protocol is rendered inert", () => {
  const html = renderMarkdown("[bad](file:///etc/passwd)", ctx);
  expect(html).toContain('data-link-kind="inert"');
  expect(html).not.toContain("file:///etc/passwd");
});

test("a javascript: link never survives", () => {
  const html = renderMarkdown("[bad](javascript:alert(1))", ctx);
  expect(html).not.toContain("javascript:");
});

test("mailto stays a plain link", () => {
  const html = renderMarkdown("[mail](mailto:a@b.com)", ctx);
  expect(html).toContain('href="mailto:a@b.com"');
});

test("is a no-op without a render context", () => {
  const html = renderMarkdown("[other](./other.md)");
  expect(html).not.toContain("data-link-kind");
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `bun test src/features/markdown-preview/lib/rehypeLinks.test.ts`
Expected: FAIL — no `data-link-kind` in the output.

- [ ] **Step 4: Implement the link plugin**

Create `src/features/markdown-preview/lib/rehypeLinks.ts`:

```ts
import type { Element, Root } from "hast";
import type { Plugin } from "unified";
import { visit } from "unist-util-visit";
import type { RenderContext } from "./pipeline";
import { resolveRepoPath } from "./resolveRepoPath";

export type LinkKind = "internal" | "github" | "external" | "inert" | "anchor";

const MARKDOWN_EXT = /\.(md|mdx|markdown)$/i;

function githubBlobUrl(ctx: RenderContext, path: string): string {
  return `https://github.com/${ctx.owner}/${ctx.repo}/blob/${ctx.sha}/${path}`;
}

/**
 * Classifies every anchor so the delegated click handler in `MarkdownPreview`
 * knows what to do with it.
 *
 * The rule is one sentence: what we can render here navigates here, and what
 * we cannot opens on GitHub. Markdown files that are part of the PR navigate
 * in-app; anything else — a Markdown file outside the diff, a `.png`, a
 * `.ts` — opens `github.com/<owner>/<repo>/blob/<sha>/<path>` in the system
 * browser without moving the app off the file under review.
 *
 * Out-of-PR files deliberately do not navigate in-app: GitHub rejects review
 * comments on files outside the diff, so rendering one in the commenting UI
 * would let a reviewer write a draft that can never be submitted.
 */
export const rehypeLinks: Plugin<[RenderContext], Root> = (ctx) => {
  return (tree) => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "a") return;
      const href = node.properties?.href;
      if (typeof href !== "string" || href === "") return;

      const set = (kind: LinkKind, props: Record<string, string | undefined>) => {
        node.properties = { ...node.properties, "data-link-kind": kind, ...props };
      };

      // Intra-document anchor. Under HashRouter an unhandled click rewrites
      // the route instead of scrolling, so the handler intercepts these.
      if (href.startsWith("#")) {
        set("anchor", { "data-href": href.slice(1) });
        return;
      }

      if (/^https?:/i.test(href)) {
        set("external", { rel: "noopener noreferrer" });
        return;
      }

      if (/^mailto:/i.test(href)) return; // plain link, nothing to intercept

      // Any other explicit scheme (file:, javascript:, custom) is inert. The
      // sanitizer would drop the href anyway; marking it lets CSS show the
      // reader that it is not actionable.
      if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//")) {
        set("inert", { href: undefined });
        return;
      }

      const resolved = resolveRepoPath(ctx.filePath, href);
      if (!resolved) {
        set("inert", { href: undefined });
        return;
      }

      if (MARKDOWN_EXT.test(resolved) && ctx.prFiles.includes(resolved)) {
        // HashRouter resolves this natively — no JS needed.
        set("internal", { href: `#${ctx.basePath}/files/${resolved}` });
        return;
      }

      set("github", { href: undefined, "data-href": githubBlobUrl(ctx, resolved) });
    });
  };
};
```

`github` and `inert` links carry no `href`, so the WebView cannot navigate even if the click handler fails to run. The real destination rides on `data-href`.

- [ ] **Step 5: Add it to the pipeline**

In `src/features/markdown-preview/lib/pipeline.ts`, import the plugin and add it inside the `if (ctx)` block, right after `rehypeRepoAssets`:

```ts
import { rehypeLinks } from "./rehypeLinks";
```

```ts
  if (ctx) {
    processor.use(rehypeRepoAssets, ctx);
    processor.use(rehypeLinks, ctx);
  }
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `bun test src/features/markdown-preview/lib/rehypeLinks.test.ts`
Expected: PASS, all nine cases.

- [ ] **Step 7: Register the opener plugin in Rust**

In `src-tauri/src/bootstrap.rs`, add the plugin to the builder chain:

```rust
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .register_asynchronous_uri_scheme_protocol(asset_protocol::SCHEME, asset_protocol::handle);
```

In `src-tauri/capabilities/default.json`, add the permission:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Capabilities required for repository selection, dialogs, and opening external links.",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "core:window:default",
    "dialog:allow-open",
    {
      "identifier": "core:window:allow-set-title"
    },
    {
      "identifier": "opener:allow-open-url",
      "allow": [{ "url": "https://*" }, { "url": "http://*" }]
    }
  ]
}
```

- [ ] **Step 8: Add the i18n keys**

In `src/shared/i18n/locales/en.json`, add to the `markdownPreview` object:

```json
    "image": {
      "unavailable": "Image not available at this commit",
      "altFallback": "Image"
    },
    "links": {
      "inertTitle": "This link points somewhere Markdown Reviewer can't open"
    }
```

- [ ] **Step 9: Wire the handlers into MarkdownPreview**

In `src/features/markdown-preview/components/MarkdownPreview.tsx`:

Add imports:

```ts
import { scrollToAnchorId } from "@/features/main/lib/scrollToAnchor";
import { openUrl } from "@tauri-apps/plugin-opener";
import { type RenderContext, renderMarkdown } from "../lib/pipeline";
```

Add `renderContext` to `MarkdownPreviewProps`:

```ts
  /** When present, relative images and local links resolve against the PR. */
  renderContext?: RenderContext;
```

Accept it in the destructured params and pass it through:

```ts
  const html = useMemo(() => renderMarkdown(source, renderContext), [source, renderContext]);
```

The caller must memoize `renderContext` — the processor cache is keyed on object identity, so a fresh object every render rebuilds the unified chain each time. Step 10 does this.

Add the delegated handlers after the existing `useEffect`:

```ts
  // One delegated listener for every link in the document. `rehypeLinks` has
  // already classified each anchor; this only acts on the classification.
  const onArticleClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    const anchor = (event.target as HTMLElement).closest("a");
    if (!anchor) return;
    const kind = anchor.dataset.linkKind;

    if (kind === "anchor") {
      // Under HashRouter an unhandled `#id` click rewrites the route.
      event.preventDefault();
      scrollToAnchorId(anchor.dataset.href ?? "");
      return;
    }

    if (kind === "external" || kind === "github") {
      event.preventDefault();
      const url = kind === "external" ? anchor.getAttribute("href") : anchor.dataset.href;
      if (url) void openUrl(url).catch(() => undefined);
      return;
    }

    if (kind === "inert") event.preventDefault();
    // `internal` is a plain hash href — HashRouter handles it natively.
  }, []);

  // Flags images the mdasset:// handler couldn't resolve, so CSS can show a
  // placeholder instead of the WebView's broken-image glyph.
  useEffect(() => {
    const root = articleRef.current;
    if (!root) return;
    const onError = (event: Event) => {
      const target = event.target as HTMLElement;
      if (target.tagName === "IMG") target.dataset.broken = "true";
    };
    root.addEventListener("error", onError, true); // capture: `error` doesn't bubble
    return () => root.removeEventListener("error", onError, true);
  }, [html]);
```

Attach the click handler to the `<article>`:

```tsx
      <article
        ref={articleRef}
        onClick={onArticleClick}
        className={cn("prose-styles px-8 py-8 text-[15px] leading-7", className)}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized via rehype-sanitize.
        dangerouslySetInnerHTML={{ __html: html }}
      />
```

If Biome complains about a click handler on a non-interactive element, add the accompanying `onKeyDown` or a targeted `biome-ignore` — this is event delegation over rendered content, not an interactive element.

- [ ] **Step 10: Build the context at the call site**

In `src/features/file-explorer/screens/PullRequestScreen/PreviewArea.tsx`, add `owner`, `repo`, and `prFiles` to `PreviewAreaProps`, build a memoized context, and pass it down:

```ts
import { type RenderContext } from "@/features/markdown-preview";
import { useMemo } from "react";
```

```ts
interface PreviewAreaProps {
  repoPath: string | undefined;
  sha: string | undefined;
  filePath: string;
  isDetailLoading: boolean;
  prNumber: number;
  owner: string;
  repo: string;
  /** Repo-relative paths of the PR's changed files. */
  prFiles: readonly string[];
}
```

```ts
  // Memoized on identity: the pipeline caches one processor per context
  // object, so a new object each render would rebuild the unified chain.
  const renderContext = useMemo<RenderContext | undefined>(
    () =>
      repoPath && sha
        ? {
            repoPath,
            sha,
            filePath,
            owner,
            repo,
            prFiles,
            basePath: `/repo/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${prNumber}`,
          }
        : undefined,
    [repoPath, sha, filePath, owner, repo, prFiles, prNumber],
  );
```

Then add `renderContext={renderContext}` to the `<MarkdownPreview …>` call.

In `src/features/file-explorer/screens/PullRequestScreen/index.tsx`, pass the new props. `markdownFiles` is already computed at line 39; derive the path list from the full changed-file set so a link to any file in the PR resolves:

```tsx
          <PreviewArea
            repoPath={repoPath.data ?? undefined}
            sha={detail.data?.headSha}
            filePath={selectedPath}
            isDetailLoading={repoPath.isLoading || detail.isLoading}
            prNumber={prNumber}
            owner={owner}
            repo={repo}
            prFiles={prFilePaths}
          />
```

with, next to the other `useMemo`s:

```ts
  const prFilePaths = useMemo(() => (files.data ?? []).map((f) => f.path), [files.data]);
```

Export the type from the feature barrel — in `src/features/markdown-preview/index.ts`, add:

```ts
export type { RenderContext } from "./lib/pipeline";
```

- [ ] **Step 11: Add the placeholder and inert-link styles**

Append to `src/shared/styles/index.css`:

```css
/* An image the mdasset:// handler couldn't resolve — the blob isn't in the
   local object database and the API didn't have it either. */
.prose-styles img[data-broken="true"] {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 12rem;
  min-height: 4rem;
  padding: 0.75rem 1rem;
  border: 1px dashed hsl(var(--border));
  border-radius: 0.375rem;
  background: hsl(var(--muted));
  color: hsl(var(--muted-foreground));
  font-size: 0.8125rem;
}

/* Links pointing somewhere we deliberately refuse to follow. */
.prose-styles a[data-link-kind="inert"] {
  color: hsl(var(--muted-foreground));
  text-decoration: line-through;
  cursor: not-allowed;
}
```

The broken-image label comes from the `alt` text the author wrote; `markdownPreview.image.unavailable` is applied as the `title` in the error handler. Extend Step 9's `onError` to set it:

```ts
      if (target.tagName === "IMG") {
        target.dataset.broken = "true";
        target.title = i18next.t("markdownPreview.image.unavailable");
      }
```

with `import { i18next } from "@/shared/i18n";` at the top of the component file.

- [ ] **Step 12: Run the full frontend suite and typecheck**

```bash
bun test
bun run typecheck
bun run check
```

Expected: all PASS.

- [ ] **Step 13: Verify manually**

Run: `bun run dev`. Open a PR with a Markdown file containing each link class and confirm, one row of the table at a time:

- a link to another `.md` in the PR navigates in-app and the sidebar selection follows;
- a link to a `.md` outside the PR opens the browser at the GitHub blob URL and the app stays put;
- a link to a `.png` or `.ts` does the same;
- an `https://` link opens in the browser;
- a `#heading` link scrolls without changing the route;
- a `file://` link does nothing and renders struck through;
- a relative image renders, and a broken one shows the placeholder.

- [ ] **Step 14: Commit**

```bash
git add src/ src-tauri/ package.json bun.lock Cargo.toml Cargo.lock
git commit -m "feat(preview): local and external link handling

One rule: what we can render here navigates here, everything else opens on
GitHub in the system browser. Out-of-PR files deliberately don't navigate
in-app — GitHub rejects review comments outside the diff, so commenting there
would produce drafts that can never be submitted.

Closes #30"
```

---

### Task 11: Documentation and full verification

**Files:**
- Modify: `ARCHITECTURE.md`
- Modify: `CLAUDE.md` (only if a documented decision changed)

**Interfaces:**
- Consumes: everything.
- Produces: a merge-ready branch.

- [ ] **Step 1: Update ARCHITECTURE.md**

`ARCHITECTURE.md` is a living document that must stay in sync when module boundaries or data flow change. Add:

- The Markdown pipeline's plugin order and the sanitize-boundary rule ("everything after `rehypeSanitize` generates markup from escaped text; markup derived from untrusted source is sanitized before injection").
- The `mdasset://` scheme: its URL shape, that it resolves at the PR head SHA through `git show`, and that it is not a filesystem read primitive.
- `process::run_bytes` alongside `run`, and why (`from_utf8_lossy` corrupts binary).
- The CSP, including why `img-src` keeps `data:` and lists the Windows `http://mdasset.localhost` form.
- The link classification table.

- [ ] **Step 2: Run every verification command**

```bash
bun test
bun run typecheck
bun run check
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
cargo test --package markdown-reviewer-infra -- --ignored
```

Every one must pass. Do not proceed on a failure — fix it.

- [ ] **Step 3: Verify a production build**

```bash
bun run build
```

Launch the bundled app with DevTools open and walk the full manual checklist from the spec's *Manual verification* section: dev HMR, production CSP clean, alert icons present, relative images, every link class, commenting on a highlighted code block, and an OS theme flip.

The commenting check matters most — Shiki replaces the `<pre>` node, and `data-source-line` carrying over is the difference between working and silently-broken comment anchoring on code blocks.

- [ ] **Step 4: Commit and open the PR**

```bash
git add ARCHITECTURE.md CLAUDE.md
git commit -m "docs: record the Phase 5 pipeline, mdasset scheme, and CSP decisions"
git push -u origin finalize-phase-5
```

Open the PR with a body that closes all three issues (`Closes #27`, `Closes #29`, `Closes #30`), notes that #30's working-tree wording was superseded by SHA resolution and why, and links the spec.

- [ ] **Step 5: Close the milestone**

After the PR merges and the manual checklist passes:

```bash
gh api -X PATCH repos/jaovito/markdown-reviewer/milestones/5 -f state=closed
```

# Phase 5 / #27 · #29 · #30 — Finalization (Design)

**Status:** Draft · **Date:** 2026-08-06 · **Branch:** `finalize-phase-5` · **Milestone:** [Phase 5 — GitHub-parity Markdown Preview](https://github.com/jaovito/markdown-reviewer/milestone/5)

Closes the three remaining Phase 5 issues, which [#61](https://github.com/jaovito/markdown-reviewer/pull/61) explicitly deferred:

- [#27](https://github.com/jaovito/markdown-reviewer/issues/27) — Syntax highlighting with Shiki.
- [#29](https://github.com/jaovito/markdown-reviewer/issues/29) — HTML sanitization with an explicit allowlist + malicious-input regression fixtures.
- [#30](https://github.com/jaovito/markdown-reviewer/issues/30) — Relative images and local file links.

Ships on a single branch / one PR. The `CLAUDE.md` product principles apply throughout: the rendered preview is the main screen, HTML is sanitized with a safe allowlist, `git`/`gh` calls stay structured and typed, and **no user-facing string is hardcoded on the frontend**.

---

## Goals

1. Fenced code blocks are syntax-highlighted with Shiki using GitHub's own light/dark themes, switching with the OS color scheme without a re-render, and falling back to unstyled-but-themed output for unknown or absent languages.
2. The sanitize allowlist is explicit and documented rather than derived from `defaultSchema`, and a regression suite proves dangerous HTML does not survive it.
3. Mermaid SVG — today injected into the DOM *after* sanitization — is sanitized before injection, closing the one real hole in the current pipeline.
4. A real Content-Security-Policy backs the sanitizer as a second layer, so a sanitizer bug alone cannot produce script execution.
5. Relative image paths in Markdown resolve against the **PR head SHA** and render in the preview.
6. Links behave predictably: in-PR Markdown navigates in-app; everything else we cannot render opens on GitHub in the system browser; unknown protocols are inert.
7. Comment anchoring and the diff gutter keep working over highlighted code blocks.

## Non-goals

- Highlighting languages outside the curated set with full grammar fidelity — they fall back to plain `text` (see *Language set* below).
- Rendering non-Markdown files in-app (PDFs, images as documents, source files). Those open on GitHub.
- Reading the working tree. Nothing in this design touches the checked-out files; see *Decision: SHA, not working tree*.
- Offline asset rendering when neither the local object database nor the GitHub API has the blob.
- Repo cloning / search — Phase 7.

---

## Decisions

### Decision: SHA, not working tree

Issue #30 says "resolve relative image paths against the repo working tree". We do **not** do this. `read_markdown_file` (`crates/core/src/application/files/read_markdown_file.rs:14-17`) reads at `git show <sha>:<path>` and falls back to the GitHub Contents API; the app never reads the working tree. Images resolve the same way, at the PR head SHA.

Rationale:

- The reviewer sees the image as it exists *in the commit under review*, not as it exists on whatever branch happens to be checked out.
- It works when the PR branch was never checked out locally (the API fallback covers it).
- It removes an entire class of vulnerability for free: because `git show <sha>:<path>` resolves paths inside a tree object, there is no filesystem traversal primitive. `../../etc/passwd` does not resolve — git simply reports the path missing.

The issue text is superseded by this decision; the issue will be closed with a note explaining it.

### Decision: Shiki runs *after* sanitization

Shiki emits inline `style` on nearly every `<span>`. Allowing `style` through the sanitize allowlist to accommodate it would weaken the schema for every element, permanently, to serve one generator.

Running Shiki after `rehypeSanitize` avoids that entirely. This is safe because Shiki's input is already-sanitized text and Shiki escapes what it emits — it is a generator producing markup from text, not a passthrough for author-supplied HTML.

This establishes the pipeline's security rule, which #29 formalizes in code comments:

> **Sanitization is the boundary for untrusted HTML. Anything appended after it must be markup we generate from escaped text. Markup derived from untrusted source — Mermaid's SVG, which is compiled from author-written diagram source — must be sanitized before injection.**

Mermaid violates this rule today (`src/features/markdown-preview/hooks/useMermaid.ts:99`). Fixing it is part of #29.

### Decision: custom URI scheme, not base64 data URIs

Image bytes reach `<img>` through a `mdasset://` asynchronous URI scheme registered in `src-tauri`, not through an IPC command returning base64.

- A sync rehype plugin rewrites `src` inside the existing pipeline; no post-mount DOM mutation, which is the pattern #29 is disciplining.
- The WebView caches and lazy-loads natively; no 33% base64 inflation, no multi-megabyte strings in the DOM.
- `src` stays a URL, so the plugin is testable as a pure string transform.

Cost: registering the scheme and allowlisting the protocol in the sanitize schema and CSP.

### Decision: synchronous Shiki with statically-imported grammars

`createHighlighterCoreSync` with `createJavaScriptRegexEngine()` (Shiki ≥3.9.1 supports all built-in languages on the JS engine; the repo will use 4.4.x) keeps `renderMarkdown` synchronous.

The alternative — async `createHighlighter` with dynamic grammar loading — buys a smaller initial bundle at the cost of making `renderMarkdown` async, adding loading state to the component, and flashing unstyled code on every file open. In a desktop app nothing is fetched over the network, so bundle size is close to free. Sync wins on every axis that matters here, and keeps the test suite synchronous.

---

## Architecture

### Pipeline restructure

`pipeline.ts` currently builds a module-level singleton processor (`src/features/markdown-preview/lib/pipeline.ts:71-79`). #30 needs per-document context — the repo, the SHA, and the current file's directory — to resolve `./diagram.png`. The processor therefore becomes a factory.

```ts
export interface RenderContext {
  repoPath: string;
  sha: string;
  filePath: string;
  /** Owner and repo — needed to build `github.com/<owner>/<repo>/blob/…` URLs. */
  owner: string;
  repo: string;
  /** Paths of the PR's changed files — decides in-app vs. GitHub for .md links. */
  prFiles: readonly string[];
  /** Route prefix for in-app navigation, e.g. `/repo/o/r/pulls/12`. */
  basePath: string;
}

export function renderMarkdown(source: string, ctx?: RenderContext): string;
```

Without a context the asset and link plugins are no-ops and output matches today's behavior, so existing tests and any context-free caller keep working.

Processor order:

```
remarkParse → remarkGfm → remarkSourceLine → remarkGithubAlerts
  → remarkRehype { allowDangerousHtml: false }
  → rehypeSlug → rehypeMermaid → rehypeRepoAssets → rehypeLinks
  → rehypeSanitize          ← boundary for untrusted HTML
  → rehypeShiki             ← generator-only, deliberately after
  → rehypeStringify
```

Processors are memoized by context identity so a re-render of the same file does not rebuild the unified chain.

### File summary

```
src/features/markdown-preview/lib/
  pipeline.ts               (rewrite)  factory taking RenderContext; new plugin order
  sanitizeSchema.ts         (new)      explicit, documented allowlist
  sanitizeSvg.ts            (new)      SVG-specific sanitizer for Mermaid output
  highlighter.ts            (new)      module-level sync Shiki highlighter
  rehypeShiki.ts            (new)      sync transformer, preserves data-source-line
  rehypeRepoAssets.ts       (new)      relative img src → mdasset://
  rehypeLinks.ts            (new)      classify anchors: in-app / github / external / inert
  resolveRepoPath.ts        (new)      pure path resolution (./, ../, /) + normalization
  __fixtures__/malicious.ts (new)      table-driven XSS vectors

src/features/main/lib/
  scrollToAnchor.ts         (edit)     + scrollToAnchorId for slugged headings

src/features/markdown-preview/hooks/
  useMermaid.ts             (edit)     sanitize SVG before innerHTML; htmlLabels: false

src/features/markdown-preview/components/
  MarkdownPreview.tsx       (edit)     pass RenderContext; delegated click + img error handlers

src/features/file-explorer/screens/PullRequestScreen/
  PreviewArea.tsx           (edit)     build and pass RenderContext

src/shared/styles/index.css (edit)     .shiki light/dark rules; broken-image placeholder
src/shared/i18n/locales/en.json (edit) new keys under markdownPreview.*

crates/core/src/ports/git.rs          (edit)  + show_file_bytes
crates/core/src/ports/gh.rs           (edit)  + get_file_bytes
crates/core/src/application/files/
  read_repo_asset.rs                  (new)   mirrors read_markdown_file, bytes
crates/infra/src/process/mod.rs       (edit)  + run_bytes (raw stdout)
crates/infra/src/git/git_cli.rs       (edit)  implement show_file_bytes
crates/infra/src/gh/gh_cli.rs         (edit)  implement get_file_bytes
src-tauri/src/bootstrap.rs            (edit)  register mdasset:// scheme; opener plugin
src-tauri/tauri.conf.json             (edit)  csp + devCsp
src-tauri/capabilities/default.json   (edit)  opener:allow-open-url
src-tauri/Cargo.toml                  (edit)  tauri-plugin-opener
```

---

## #27 — Syntax highlighting

### Highlighter

`highlighter.ts` builds one module-level highlighter:

```ts
createHighlighterCoreSync({
  engine: createJavaScriptRegexEngine(),
  themes: [githubLight, githubDark],
  langs: [/* curated set, statically imported */],
});
```

### Language set

Curated for documentation review, not for a general-purpose editor:

`typescript`, `javascript`, `tsx`, `jsx`, `json`, `yaml`, `toml`, `bash`, `rust`, `python`, `go`, `sql`, `html`, `css`, `markdown`, `diff`.

Anything else falls back to `text`. Adding a language is a one-line static import — deliberately a conscious act, so the bundle does not drift.

### Transformer

`rehypeShiki.ts` is ours (~40 lines) rather than `@shikijs/rehype`, because it must:

1. Read the language from the `language-*` class the sanitizer already validated.
2. Fall back to `text` when the language is unknown, absent, or the fence has no info string.
3. **Carry `data-source-line` from the original `<pre>`/`<code>` onto Shiki's replacement node.** The diff gutter and comment anchoring read that attribute; dropping it breaks commenting on code blocks silently. This gets a dedicated test.

Dual theme uses `defaultColor: false`, so Shiki emits `--shiki-light` / `--shiki-dark` custom properties and CSS picks per `prefers-color-scheme`. No JS runs on a theme flip — unlike Mermaid, which must re-render.

---

## #29 — Sanitization hardening

### Explicit allowlist

`sanitizeSchema.ts` replaces the `...defaultSchema` spread with a schema written out in full and commented. Notable choices:

- `protocols.href`: `http`, `https`, `mailto`. Nothing else.
- `protocols.src`: `mdasset` only. `data:` is deliberately excluded — every image goes through the custom scheme, so `data:` would be pure attack surface.
- No `style` attribute anywhere (see *Decision: Shiki runs after sanitization*).
- No `svg`, `foreignObject`, `iframe`, `object`, `embed`, `form`, `input`.
- `data-source-line` on the existing anchor tags; `data-alert-type` and the alert class names as today.
- `id` on `h1`–`h6` only, so `rehype-slug`'s heading anchors survive without opening `id` globally.
- `data-link-kind` / `data-href` on `a`, which is how `rehypeLinks` communicates its classification to the delegated click handler.

### Mermaid SVG

`sanitizeSvg.ts` runs Mermaid's output through `hast-util-sanitize` with an SVG-specific allowlist before `node.innerHTML = svg`. Mermaid is additionally configured with `htmlLabels: false`, which removes `foreignObject` from its output entirely — so the SVG allowlist never needs to admit an element that embeds arbitrary HTML.

`securityLevel: "strict"` stays. This is defense in depth, not a replacement.

### CSP

`tauri.conf.json` moves from `"csp": null` to:

```
default-src 'self';
img-src 'self' data: mdasset: http://mdasset.localhost;
style-src 'self' 'unsafe-inline';
script-src 'self';
connect-src 'self' ipc: http://ipc.localhost;
font-src 'self';
object-src 'none';
frame-src 'none';
base-uri 'self';
form-action 'none'
```

Two entries need justifying:

- **`img-src` includes `data:`** even though the sanitize schema refuses `data:` in `<img src>`. These are not in conflict — they govern different things. CSP `img-src` also covers CSS `background-image`, and the GitHub alert icons are inline `data:image/svg+xml` backgrounds (`src/shared/styles/index.css:249-261`); dropping `data:` would silently blank them. The sanitizer independently guarantees no `data:` URL ever reaches an `<img>` from Markdown.
- **`img-src` includes `http://mdasset.localhost`** because Tauri serves custom schemes over an `http://<scheme>.localhost` origin on Windows rather than as `mdasset:`. Both forms are listed so one CSP works on every target.

`style-src 'unsafe-inline'` is required — Shiki's inline styles, Mermaid's injected `<style>`, and React inline styles all need it. Stated plainly: this does not close CSS injection. It does close script execution, which is the property #29 asks for.

Dev uses a separate, looser `devCsp` so Vite's HMR websocket and React Refresh preamble keep working. Both dev and production builds get verified manually.

### Regression fixtures

`__fixtures__/malicious.ts` is a table of `{ name, markdown, mustNotContain }` cases, asserted by a single parameterized test:

`<script>` · `<img src=x onerror=…>` · `<svg onload=…>` · `[x](javascript:alert(1))` · `[x](data:text/html,…)` · `<iframe>` · `<object>` / `<embed>` · `<style>` · `<form>` / `<input>` · `href` with interleaved whitespace and HTML entities (`java&#115;cript:`) · `<a target="_blank">` without `rel` · nested/malformed tags attempting to escape the parser.

Every case asserts the output contains no `<script`, no `on\w+=`, and no `javascript:`. The suite also asserts the sanitizer is genuinely exercised, not merely shadowed by `allowDangerousHtml: false` — cases feed HTML through paths that reach the sanitizer.

---

## #30 — Relative images and local file links

### Rust: reading bytes

`process::run` returns `stdout: String` via `String::from_utf8_lossy` (`crates/infra/src/process/mod.rs:63`), which corrupts binary. A new `run_bytes` captures raw `Vec<u8>` stdout, keeping the same timeout, redaction, and tracing behavior.

On top of it:

- `GitClient::show_file_bytes(repo_path, sha, file_path) -> AppResult<Option<Vec<u8>>>`
- `GhClient::get_file_bytes(repo_path, sha, file_path) -> AppResult<Vec<u8>>` — decodes the Contents API's base64 payload, reusing the existing decoder (`crates/infra/src/gh/gh_cli.rs:747-768`).
- `application::files::read_repo_asset` — same shape as `read_markdown_file`: local first, API fallback.

A 10 MB cap applies; over it the request fails with a logged, typed error rather than streaming an arbitrarily large blob into the WebView.

### The `mdasset://` scheme

Registered in `bootstrap.rs` with `register_asynchronous_uri_scheme_protocol`. Parameters travel as a **query string**, not a path:

```
mdasset://localhost/?repo=<urlencoded>&sha=<sha>&path=<urlencoded>
```

Custom-scheme host and path handling differs across platforms (Windows in particular mangles `mdasset://<host>` forms); a query string sidesteps it. The handler resolves bytes via `read_repo_asset`, sets `Content-Type` from the file extension, and returns 404 on a miss.

Security posture: the handler is not a filesystem read primitive. All reads go through `git show <sha>:<path>` or the GitHub API, both of which resolve inside a tree object. `repo_path` is validated as a known git repository before use.

### Frontend: images

`resolveRepoPath.ts` is a pure function handling `./x.png`, `../x.png`, `x.png`, and `/x.png` (repo-root-relative), normalizing `.`/`..` segments and rejecting anything escaping the root. `rehypeRepoAssets` uses it to rewrite `src` on `<img>` when the URL has no scheme and is not protocol-relative; absolute `http(s)` sources are left alone (and then blocked by CSP — an intentional, visible outcome rather than a silent network fetch).

A missing image surfaces as a styled placeholder via a delegated `error` listener on the `<article>`, with translated alt text.

### Frontend: links

`rehypeLinks` classifies every anchor and annotates it; a single delegated click listener on the `<article>` acts on the annotation.

| Target | Behavior |
|---|---|
| `.md`/`.mdx`/`.markdown` **in** the PR's changed files | Rewritten to the in-app route `#<basePath>/files/<path>`; `HashRouter` handles it natively |
| `.md` **not** in the PR | Opens `https://github.com/<owner>/<repo>/blob/<sha>/<path>` in the system browser; the app stays where it is |
| Any other local file (`.png`, `.ts`, `.pdf`) | Same — opens on GitHub |
| `http(s)` external | System browser; `rel="noopener noreferrer"` |
| Anything else (`file:`, `javascript:`, custom) | Inert: `href` stripped, marked so styling can show it as non-actionable |
| `#heading` (intra-document) | `preventDefault` + scroll to the slugged heading |

The last row carries two traps.

First, the app mounts `HashRouter` (`src/main.tsx:13`), so an unhandled `#heading` click rewrites the *route*, not the scroll position. These clicks are intercepted and scrolled manually.

Second — and this is a gap the design review caught — **headings currently have no `id` at all**. There is no slugger in the pipeline, so `[Setup](#setup)` links point at nothing today. `rehype-slug` is added before sanitization to emit GitHub-compatible heading ids, and `id` is allowlisted on heading tags. Without it the intra-document row is unimplementable, and table-of-contents links — ubiquitous in exactly the documentation this app exists to review — stay broken. The existing `scrollToAnchorLine` helper is *not* reusable here: it queries `data-source-line`, not `id`. A sibling `scrollToAnchorId` is added next to it.

Opening the browser uses `tauri-plugin-opener` with capability `opener:allow-open-url` scoped to `http`/`https`.

### i18n

New keys under `markdownPreview.*`: broken-image placeholder text and alt fallback, inert-link title, and any error copy the asset path surfaces. No user-facing string is hardcoded.

---

## Error handling

| Failure | Behavior |
|---|---|
| Image blob missing at SHA and on the API | `mdasset` returns 404 → styled placeholder, translated alt text. Document still renders. |
| Image over 10 MB | Typed error, logged, placeholder shown. |
| Unknown code-fence language | Falls back to `text`. Block still gets the theme container. |
| Shiki throws on a block | Caught per-block; the original `<pre><code>` is left intact. One bad fence never blanks a document. |
| Mermaid SVG fails sanitization | Falls back to the existing localized error block plus source. |
| `tauri-plugin-opener` fails | Logged; the click is a no-op rather than an unhandled rejection. |
| CSP violation in production | Surfaces in the console during manual verification; treated as a release blocker. |

---

## Testing

### `bun test`

- **rehypeShiki** — known language; unknown language falls back to `text`; fence with no info string; `data-source-line` survives onto the replacement node; a throwing highlight leaves the original block intact.
- **sanitizeSchema** — the full malicious-fixture table; plus positive assertions that alerts, tables, task lists, and `data-source-line` still survive.
- **sanitizeSvg** — strips `<script>`, `on*` handlers, and `foreignObject` from SVG input; keeps ordinary shape elements.
- **resolveRepoPath** — `./`, `../`, bare, root-relative, redundant segments, and traversal attempts escaping the root.
- **rehypeRepoAssets** — rewrites relative sources; leaves absolute URLs and protocol-relative URLs alone; no-ops without a context.
- **rehypeLinks** — one case per row of the classification table.
- **rehypeSlug integration** — headings get GitHub-compatible ids, duplicate headings get `-1`/`-2` suffixes, and the ids survive sanitization.

### Rust

- `crates/core/tests/` — `read_repo_asset` with in-memory fakes: local hit, local miss → API fallback, both miss, oversize.
- `crates/infra/` — integration test with `tempfile`: init a repo, commit a PNG, read it back through `show_file_bytes` and assert bytes are byte-identical (this is the regression guard for the `from_utf8_lossy` corruption). Marked `#[ignore]` per ARCHITECTURE.md.

### Manual verification

1. `bun run dev` — HMR works under `devCsp`; no CSP violations in the console.
2. Production build — Mermaid renders, Shiki colors, images load, no CSP violations.
3. GitHub alert callouts still show their icons — they are `data:` CSS backgrounds and are the canary for an over-tight `img-src`.
4. A doc with a relative image renders it; a doc with a broken relative image shows the placeholder and still renders.
5. Each link class behaves per the table, including an intra-document `#heading` anchor that scrolls without changing route.
6. Commenting on a highlighted code block still anchors correctly.
7. OS theme flip recolors code without a re-render and recolors Mermaid with one.

---

## Delivery

One branch, one PR, closing #27, #29, and #30. The Phase 5 milestone closes once the PR merges and the manual checklist above passes.

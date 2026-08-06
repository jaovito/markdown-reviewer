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
    div: ["data-source-line", "data-alert-type", ["className", ...ALERT_CLASSNAMES, "mermaid"]],
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

import type { Root } from "hast";
import { fromHtml } from "hast-util-from-html";
import { type Schema, sanitize } from "hast-util-sanitize";
import { toHtml } from "hast-util-to-html";
import { visit } from "unist-util-visit";

/**
 * Allowlist for Mermaid's rendered SVG. This is deliberately separate from
 * the document allowlist in `sanitizeSchema.ts`: the document never contains
 * SVG (the sanitizer strips it), and diagrams never contain prose markup.
 *
 * `foreignObject` is absent on purpose — it embeds arbitrary HTML inside SVG
 * and would reopen every vector the document allowlist closes. `useMermaid`
 * configures Mermaid with `htmlLabels: false` so it never emits one. Fail-
 * closed tradeoff: Mermaid also reaches for `foreignObject` on diagram types
 * that don't go through `htmlLabels` at all — the "byTspan"/"fo" text-
 * placement path used by sequence, journey, and C4 diagrams, and its KaTeX
 * math rendering. Stripping it means those diagrams can render with blank
 * labels rather than a script-execution hole; that trade is intentional.
 *
 * `style` is admitted because Mermaid injects diagram theming that way. This
 * permits CSS injection scoped to the diagram; it does not permit script
 * execution, which is the property that matters here — enforced below by
 * `neutralizeStyleText`, not by this schema alone (see its comment).
 *
 * `href`/`xLinkHref` on `image` stay allowlisted for `http`/`https`: Mermaid's
 * image-shaped nodes (e.g. `A@{ img: "https://..." }`) set a real external
 * URL on `<image href>` (verified against `chunk-KGFNY3KK.mjs` in the
 * installed `mermaid` package — `E.attr("href", t.img)`), so restricting this
 * to fragment references would silently break that diagram feature. The
 * privacy tradeoff this creates — a diagram can beacon a reviewer's IP the
 * same way a remote Markdown image would — is deliberately left to Task 4's
 * CSP `img-src` as the compensating control, matching the precedent set for
 * `<img>` in the document pipeline (`sanitizeSchema.ts`), rather than solved
 * here by breaking legitimate output. The same applies to `url(...)` inside
 * the admitted `<style>` text — CSS `background`/`content` URLs are also
 * governed by `img-src`.
 *
 * `clobber: []` overrides `hast-util-sanitize`'s own default
 * (`['ariaDescribedBy', 'ariaLabelledBy', 'id', 'name']` with
 * `clobberPrefix: "user-content-"`, `hast-util-sanitize/lib/schema.js`),
 * which this schema would otherwise silently inherit — `sanitize()` shallow-merges
 * whatever schema it's given with its `defaultSchema`
 * (`{...defaultSchema, ...options}`), so any top-level key this schema
 * doesn't set falls back to the document-sanitizer-style default. Leaving
 * that default active prefixes every `id` (verified: `<symbol id="s">`
 * becomes `id="user-content-s"`) without rewriting the `#s` references
 * elsewhere in the tree that point at it — `xlink:href`, `marker-end`,
 * `fill="url(#...)"`, `clip-path`, `mask`. Those references are exactly how
 * Mermaid wires up arrow markers, gradients, clip paths, and `<use>`/
 * `<symbol>` reuse, so the inherited default breaks them outright rather
 * than protecting anything: unlike document prose (where `id` values are
 * incidental and clobbering is a real risk `sanitizeSchema.ts` is right to
 * guard against), every `id` in this SVG exists solely to be referenced by
 * a `#fragment` within the same subtree. That argument depends on the output
 * actually being SVG-namespaced — see the root-shape check in `sanitizeSvg`
 * below — since named-access-on-`Window` (the clobbering mechanism this
 * disables) is defined over HTML-namespace elements only.
 *
 * SMIL (`animate`, `set`, `animateTransform`, …) is absent by omission, not
 * oversight: `<set attributeName="onclick" to="alert(1)">` would set a live
 * handler on a target element after this sanitizer has already run, since
 * the mutation happens in the browser at animation time, not in the static
 * markup this schema inspects. Do not add these without a different
 * enforcement mechanism.
 */
const svgSchema: Schema = {
  strip: ["script", "foreignObject"],
  clobber: [],
  protocols: { href: ["http", "https"], xLinkHref: ["http", "https"] },
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
    //
    // Property names here are hast's post-`property-information` camelCase
    // spellings, not the DOM attribute spelling — and NOT a spelling you can
    // reliably derive by guessing (three review rounds on this file each
    // found more entries that looked right and weren't: `class`, `xlinkHref`,
    // `strokeDashoffset`, `strokeDasharray`, `strokeLinecap`,
    // `strokeLinejoin`, `ariaRoledescription`). Every entry in this list —
    // not just a sample — is now cross-checked against
    // `property-information`'s `svg.property` map (the source
    // `hast-util-from-html`/`hast-util-to-html` both read) via a script, not
    // by inspecting individual names, because a schema key that doesn't
    // match the real property name is silently dropped rather than
    // rejected — there is no test failure to catch a wrong guess short of
    // asserting that exact attribute survives. `data-*` names (`dataId`,
    // `dataLook` below) aren't in that static map at all — they're handled
    // by a separate generic camelCasing rule — so those two were confirmed
    // directly against `hast-util-from-html` output instead. When adding an
    // entry, verify it the same way rather than pattern-matching neighboring
    // names; the "obvious" camelCase form has been wrong more often than
    // right in this file.
    "*": [
      "id",
      "className",
      "style",
      "transform",
      "fill",
      "fillOpacity",
      "fillRule",
      "stroke",
      "strokeWidth",
      "strokeLineCap",
      "strokeLineJoin",
      "strokeDashArray",
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
      "ariaRoleDescription",
      // Emitted across various Mermaid diagram renderers (kanban, sequence,
      // gitgraph, ER, flowchart) but missing from the list above.
      "dataId",
      "dataLook",
      "strokeDashOffset",
      "pointerEvents",
      "paintOrder",
      "xmlSpace",
    ],
    a: ["href", "xLinkHref", "target", "rel"],
    use: ["href", "xLinkHref"],
    image: ["href", "xLinkHref"],
  },
};

/**
 * `hast-util-to-html` serializes any element literally named `style` as raw
 * text — keyed on `tagName` alone, with no check for SVG vs. HTML namespace
 * (`hast-util-to-html/lib/handle/text.js`). `hast-util-from-html` (parse5),
 * by contrast, does NOT treat an SVG-namespace `<style>` as raw text on the
 * way in: it decodes character references there like any other foreign-
 * content element. The two disagreeing means escaped input can round-trip
 * unescaped: `&lt;/style&gt;&lt;img onerror=...&gt;` is decoded to a literal
 * `</style><img onerror=...>` by the parser, then written back out verbatim
 * by the serializer, because raw-text output never re-escapes. Re-parsed by
 * a browser's `innerHTML`, that `<img>` is a foreign-content breakout tag —
 * it lands in the HTML namespace, sibling to `<svg>`, with a live handler.
 *
 * `sanitize()` cannot fix this: the offending `<` only exists in a text
 * node's value, which sanitization doesn't inspect. So this strips `<` from
 * every `style` element's text after sanitizing, closing the gap directly
 * rather than relying on the parser/serializer to agree. Plain removal
 * (rather than a CSS escape) because legitimate Mermaid theming CSS never
 * contains `<` — there's nothing to preserve.
 */
function neutralizeStyleText(tree: Root): void {
  visit(tree, "element", (node) => {
    if (node.tagName !== "style") return;
    for (const child of node.children) {
      if (child.type === "text") child.value = child.value.replaceAll("<", "");
    }
  });
}

/**
 * `clobber: []` above is only safe because the output is guaranteed to be a
 * single `<svg>` element — `svg`-namespaced content is exactly what falls
 * outside `Window`'s named-property access, which is what DOM clobbering via
 * `id` exploits. A non-`svg`-rooted result (e.g. this function called with a
 * bare `<rect>` because the input was malformed or truncated) would be
 * HTML-namespace markup wearing this schema's permissive `id` handling, with
 * none of the reasoning above actually applying to it. `useMermaid.ts` only
 * ever calls this with real `mermaid.render()` output, where the condition
 * doesn't fire — but `sanitizeSvg` is an exported function whose contract is
 * broader than its one caller, so this is enforced rather than assumed.
 */
function assertSvgRooted(tree: Root): void {
  const meaningful = tree.children.filter(
    (child) => child.type !== "text" || child.value.trim() !== "",
  );
  const [root, ...rest] = meaningful;
  if (rest.length > 0 || !root || root.type !== "element" || root.tagName !== "svg") {
    throw new Error("sanitizeSvg: expected a single <svg>-rooted fragment");
  }
}

/**
 * Runs Mermaid's rendered SVG through an SVG-specific allowlist before it is
 * injected into the DOM. Mermaid already runs in `securityLevel: "strict"`;
 * this is the second layer, because the SVG is compiled from untrusted
 * diagram source and is injected after the document sanitizer has run.
 */
export function sanitizeSvg(svg: string): string {
  const tree = fromHtml(svg, { fragment: true });
  const clean = sanitize(tree, svgSchema) as Root;
  neutralizeStyleText(clean);
  assertSvgRooted(clean);
  return toHtml(clean);
}

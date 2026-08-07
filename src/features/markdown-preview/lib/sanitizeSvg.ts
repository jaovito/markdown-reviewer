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

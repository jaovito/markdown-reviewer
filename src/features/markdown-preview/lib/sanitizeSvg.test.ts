import { expect, test } from "bun:test";
import { fromHtml } from "hast-util-from-html";
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
  const out = sanitizeSvg("<svg><script>alert(1)</script><rect/></svg>");
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

test("strips markup smuggled through <style> via decoded character references", () => {
  // hast-util-to-html serializes any element named `style` as raw text keyed
  // on tagName alone, with no SVG-vs-HTML namespace check, while parse5
  // decodes character references in an SVG-namespace <style> during parsing
  // like any other foreign-content element (it does NOT treat it as raw
  // text on the way in). The two disagreeing lets escaped input round-trip
  // unescaped: this input decodes to a literal `</style><img onerror=...>`
  // during parsing, which the serializer then writes back out verbatim.
  const out = sanitizeSvg(
    "<svg><style>&lt;/style&gt;&lt;img src=x onerror=alert(1)&gt;</style></svg>",
  );
  // "onerror" as inert text inside the style element is fine — it's not an
  // attribute on a live element. What must not happen is a real <img> tag
  // breaking out of the style text into markup, so this checks the tag, not
  // the substring.
  expect(out).not.toContain("<img");
  // Re-parse the output the way `innerHTML` would, to prove the danger is
  // structural and not just a substring check: no element should exist
  // outside the <svg> root, and no element anywhere should carry a live
  // `onerror`/`on*` handler property.
  const reparsed = fromHtml(out, { fragment: true });
  expect(reparsed.children).toHaveLength(1);
  expect(reparsed.children[0]).toMatchObject({ type: "element", tagName: "svg" });
});

test("keeps class, stroke-width, and fill-opacity for diagram theming", () => {
  // Regression guard for hast's property-name spellings, which the
  // attribute allowlist must match exactly or the attribute is silently
  // dropped: `class` arrives as `className` (not `class`), and `fill` /
  // `stroke` compounds keep the property-name casing hast assigns them.
  const out = sanitizeSvg(
    '<svg><g class="node default"><rect stroke-width="2" fill-opacity="0.5"/></g></svg>',
  );
  expect(out).toContain('class="node default"');
  expect(out).toContain('stroke-width="2"');
  expect(out).toContain('fill-opacity="0.5"');
});

test("keeps data-id, data-look, stroke-dashoffset, pointer-events, paint-order, and xml:space", () => {
  // These are real attributes Mermaid emits across several diagram
  // renderers (kanban, sequence, gitgraph, ER, flowchart) that were missing
  // from the schema. `stroke-dashoffset` in particular camelCases to
  // `strokeDashOffset` (capital O) rather than the `strokeDasharray`/
  // `strokeLinecap` lowercase-o pattern the rest of the schema follows.
  const out = sanitizeSvg(
    '<svg><rect data-id="a" data-look="b" stroke-dashoffset="1" pointer-events="none" ' +
      'paint-order="stroke" xml:space="preserve"/></svg>',
  );
  expect(out).toContain('data-id="a"');
  expect(out).toContain('data-look="b"');
  expect(out).toContain('stroke-dashoffset="1"');
  expect(out).toContain('pointer-events="none"');
  expect(out).toContain('paint-order="stroke"');
  expect(out).toContain('xml:space="preserve"');
});

test("strips javascript: on xlink:href while keeping a fragment xlink:href", () => {
  // `xlink:href` parses to the hast property `xLinkHref` (capital L) — not
  // `xlinkHref` — so a schema keyed on the latter admits nothing and the
  // attribute is dropped outright (fails safe, but the protocol allowlist
  // is inert). This proves both the drop of a dangerous value and the
  // survival of a legitimate one, so a schema that merely omits `xlink:href`
  // entirely would fail the second assertion.
  const blocked = sanitizeSvg('<svg><use xlink:href="javascript:alert(1)"/></svg>');
  expect(blocked).not.toContain("javascript:");

  const kept = sanitizeSvg(
    '<svg><defs><symbol id="s"></symbol></defs><use xlink:href="#s"/></svg>',
  );
  expect(kept).toContain('xlink:href="#s"');
});

test("keeps internal id references intact instead of clobber-prefixing them", () => {
  // hast-util-sanitize shallow-merges a partial schema with its own
  // defaultSchema, so omitting `clobber` here would silently inherit
  // `clobber: ["name", "id"]` / `clobberPrefix: "user-content-"` from the
  // document sanitizer's defaults. That prefixes `id` without rewriting the
  // `#id` references elsewhere in the tree that depend on it — breaking
  // every marker (arrowhead), gradient, clip-path, mask, and <use>/<symbol>
  // reuse Mermaid relies on. This diagram's id exists only to be referenced
  // within the same subtree, unlike a document heading id.
  const out = sanitizeSvg(
    '<svg><defs><marker id="arrow"><path d="M0 0"/></marker></defs>' +
      '<path marker-end="url(#arrow)" d="M0 0L1 1"/></svg>',
  );
  expect(out).toContain('id="arrow"');
  expect(out).not.toContain("user-content-");
  expect(out).toContain('marker-end="url(#arrow)"');
});

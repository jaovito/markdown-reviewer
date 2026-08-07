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

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

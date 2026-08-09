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

test("leaves an absolute https image untouched so GitHub-hosted images render", () => {
  const html = renderMarkdown("![x](https://user-images.githubusercontent.com/123/456.png)", ctx);
  expect(html).not.toContain("mdasset");
  expect(html).toContain('src="https://user-images.githubusercontent.com/123/456.png"');
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

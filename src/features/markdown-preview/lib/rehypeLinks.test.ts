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

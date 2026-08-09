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

test("decodes percent-encoded path segments", () => {
  expect(resolveRepoPath("docs/guide.md", "image%20v2.png")).toBe("docs/image v2.png");
});

test("rejects malformed percent-encoding", () => {
  expect(resolveRepoPath("docs/guide.md", "image%E0%A0.png")).toBeNull();
});

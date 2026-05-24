import { test, expect } from "bun:test";
import type { RemoteThread, ReviewComment } from "@/shared/ipc/contract";
import { mergeLocalAndRemote } from "./mergeLocalAndRemote";

function local(id: number, githubId: number | null = null): ReviewComment {
  return {
    id,
    prNumber: 7,
    filePath: "doc.md",
    headSha: "abc",
    body: "local body",
    author: "me",
    state: githubId ? "submitted" : "draft",
    anchor: { kind: "singleLine", line: 4 },
    createdAt: 0,
    updatedAt: 0,
    githubId,
    submitError: null,
  };
}

function remote(id: string, commentId: number, line: number): RemoteThread {
  return {
    threadId: id,
    path: "doc.md",
    originalCommitId: "abc",
    line,
    startLine: null,
    originalLine: line,
    originalStartLine: null,
    state: "open",
    isOutdated: false,
    viewerCanResolve: true,
    viewerCanUnresolve: false,
    comments: [
      {
        commentId,
        author: "alice",
        authorAvatarUrl: null,
        body: "remote body",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        viewerCanUpdate: false,
        viewerCanDelete: false,
        htmlUrl: "https://",
      },
    ],
    anchor: { kind: "singleLine", line },
    mappingStatus: { kind: "mapped" },
  };
}

test("orders entries by file then start line", () => {
  const merged = mergeLocalAndRemote([local(1)], [remote("T1", 100, 1)]);
  expect(merged.map((e) => (e.kind === "remote" ? e.thread.threadId : `L${e.comment.id}`))).toEqual(
    ["T1", "L1"],
  );
});

test("drops local submitted comment when its githubId matches a remote one", () => {
  const merged = mergeLocalAndRemote([local(1, 100)], [remote("T1", 100, 4)]);
  expect(merged.length).toBe(1);
  expect(merged[0].kind).toBe("remote");
});

test("keeps local drafts even at the same anchor", () => {
  const merged = mergeLocalAndRemote([local(1, null)], [remote("T1", 100, 4)]);
  expect(merged.length).toBe(2);
});

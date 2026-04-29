import { describe, expect, test } from "bun:test";
import type { CommentAnchor, ReviewComment } from "@/shared/ipc/contract";
import { groupCommentsByStartLine } from "./groupAnchors";

function makeComment(
  id: number,
  anchor: CommentAnchor,
  overrides: Partial<ReviewComment> = {},
): ReviewComment {
  return {
    id,
    prNumber: 1,
    filePath: "docs/intro.md",
    headSha: "deadbeef",
    body: `comment ${id}`,
    author: `user${id}`,
    state: "draft",
    anchor,
    createdAt: id * 1000,
    updatedAt: id * 1000,
    githubId: null,
    submitError: null,
    ...overrides,
  };
}

describe("groupCommentsByStartLine", () => {
  test("buckets multiple comments on the same single line into one group", () => {
    const groups = groupCommentsByStartLine([
      makeComment(1, { kind: "singleLine", line: 5 }),
      makeComment(2, { kind: "singleLine", line: 5 }),
      makeComment(3, { kind: "singleLine", line: 5 }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.comments).toHaveLength(3);
    expect(groups[0]?.startLine).toBe(5);
    expect(groups[0]?.endLine).toBe(5);
    expect(groups[0]?.attachLine).toBe(5);
  });

  test("keeps comments on different lines as distinct groups", () => {
    const groups = groupCommentsByStartLine([
      makeComment(1, { kind: "singleLine", line: 5 }),
      makeComment(2, { kind: "singleLine", line: 7 }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.startLine).toBe(5);
    expect(groups[1]?.startLine).toBe(7);
  });

  test("treats single-line and equal-extent range as the same anchor", () => {
    const groups = groupCommentsByStartLine([
      makeComment(1, { kind: "singleLine", line: 5 }),
      makeComment(2, { kind: "lineRange", startLine: 5, endLine: 5 }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.comments).toHaveLength(2);
  });

  test("separates a range from a single line that share the start line", () => {
    const groups = groupCommentsByStartLine([
      makeComment(1, { kind: "singleLine", line: 10 }),
      makeComment(2, { kind: "lineRange", startLine: 10, endLine: 14 }),
    ]);
    expect(groups).toHaveLength(2);
    const lonely = groups.find((g) => g.endLine === 10);
    const ranged = groups.find((g) => g.endLine === 14);
    expect(lonely?.comments).toHaveLength(1);
    expect(ranged?.comments).toHaveLength(1);
    expect(ranged?.attachLine).toBe(14);
  });

  test("sorts comments inside a group by createdAt", () => {
    const groups = groupCommentsByStartLine([
      makeComment(1, { kind: "singleLine", line: 3 }, { createdAt: 200 }),
      makeComment(2, { kind: "singleLine", line: 3 }, { createdAt: 100 }),
      makeComment(3, { kind: "singleLine", line: 3 }, { createdAt: 300 }),
    ]);
    expect(groups[0]?.comments.map((c) => c.id)).toEqual([2, 1, 3]);
  });

  test("filters out deleted comments", () => {
    const groups = groupCommentsByStartLine([
      makeComment(1, { kind: "singleLine", line: 4 }, { state: "deleted" }),
      makeComment(2, { kind: "singleLine", line: 4 }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.comments).toHaveLength(1);
    expect(groups[0]?.comments[0]?.id).toBe(2);
  });

  test("keeps resolved and hidden comments visible in the group", () => {
    const groups = groupCommentsByStartLine([
      makeComment(1, { kind: "singleLine", line: 8 }, { state: "resolved" }),
      makeComment(2, { kind: "singleLine", line: 8 }, { state: "hidden" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.comments).toHaveLength(2);
  });

  test("sorts groups by startLine then endLine", () => {
    const groups = groupCommentsByStartLine([
      makeComment(1, { kind: "lineRange", startLine: 5, endLine: 9 }),
      makeComment(2, { kind: "singleLine", line: 5 }),
      makeComment(3, { kind: "singleLine", line: 2 }),
    ]);
    expect(groups.map((g) => `${g.startLine}:${g.endLine}`)).toEqual(["2:2", "5:5", "5:9"]);
  });
});

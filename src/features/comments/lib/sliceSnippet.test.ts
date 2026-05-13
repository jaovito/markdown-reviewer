import { describe, expect, test } from "bun:test";
import { sliceSnippet } from "./sliceSnippet";

const FIFTEEN_LINES = Array.from({ length: 15 }, (_, i) => `line ${i + 1}`);

describe("sliceSnippet", () => {
  test("returns the full range when shorter than maxVisible", () => {
    const out = sliceSnippet(FIFTEEN_LINES, 2, 4, 3);
    expect(out.visible).toEqual(["line 2", "line 3", "line 4"]);
    expect(out.more).toBe(0);
  });

  test("truncates ranges longer than maxVisible and reports the overflow", () => {
    const out = sliceSnippet(FIFTEEN_LINES, 1, 15, 3);
    expect(out.visible).toEqual(["line 1", "line 2", "line 3"]);
    expect(out.more).toBe(12);
  });

  test("single-line range yields one visible line", () => {
    const out = sliceSnippet(FIFTEEN_LINES, 7, 7, 3);
    expect(out.visible).toEqual(["line 7"]);
    expect(out.more).toBe(0);
  });

  test("clamps when endLine exceeds the file length", () => {
    const out = sliceSnippet(FIFTEEN_LINES, 14, 20, 3);
    expect(out.visible).toEqual(["line 14", "line 15"]);
    expect(out.more).toBe(5);
  });

  test("returns empty when startLine is past the end of the file", () => {
    const out = sliceSnippet(FIFTEEN_LINES, 99, 100, 3);
    expect(out.visible).toEqual([]);
    expect(out.more).toBe(2);
  });

  test("uses default maxVisible = 3 when omitted", () => {
    const out = sliceSnippet(FIFTEEN_LINES, 1, 10);
    expect(out.visible).toHaveLength(3);
    expect(out.more).toBe(7);
  });
});

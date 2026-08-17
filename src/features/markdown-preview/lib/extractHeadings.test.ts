import { expect, test } from "bun:test";
import { extractHeadings } from "./extractHeadings";

test("extractHeadings returns empty array for empty source", () => {
  expect(extractHeadings("")).toEqual([]);
  expect(extractHeadings("   \n  ")).toEqual([]);
});

test("extractHeadings extracts headings with correct depth, line numbers, and text", () => {
  const doc = `
# Title

Some text here.

## Section 1

More text.

### Subsection 1.1

Code \`sample\` and **bold text**.

#### Deep Heading
`;

  const headings = extractHeadings(doc);
  expect(headings.length).toBe(4);
  expect(headings[0]).toEqual({
    id: "heading-2-0",
    text: "Title",
    level: 1,
    line: 2,
  });
  expect(headings[1]).toEqual({
    id: "heading-6-1",
    text: "Section 1",
    level: 2,
    line: 6,
  });
  expect(headings[2]).toEqual({
    id: "heading-10-2",
    text: "Subsection 1.1",
    level: 3,
    line: 10,
  });
  expect(headings[3]).toEqual({
    id: "heading-14-3",
    text: "Deep Heading",
    level: 4,
    line: 14,
  });
});

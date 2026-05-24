export interface SnippetSlice {
  visible: string[];
  more: number;
}

export function sliceSnippet(
  lines: string[],
  startLine: number,
  endLine: number,
  maxVisible = 3,
): SnippetSlice {
  const total = Math.max(0, endLine - startLine + 1);
  const startIndex = Math.max(0, startLine - 1);
  const stop = startIndex + Math.min(total, maxVisible);
  const visible = lines.slice(startIndex, stop);
  const more = total - visible.length;
  return { visible, more };
}

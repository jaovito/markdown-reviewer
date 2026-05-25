import { useRepoContext } from "@/features/main/hooks/useRepoContext";
import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { scrollToAnchorLine } from "./scrollToAnchor";

function encodeSegments(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

/**
 * Returns a callback that focuses a comment in the preview: scrolls to its
 * anchor line when the comment lives in the file currently rendered, or
 * navigates to that file (with the line in the URL hash) otherwise.
 *
 * The hash is read by `MarkdownPreview` once the markdown finishes rendering
 * so the user lands on the right paragraph instead of the top of the file.
 */
export function useNavigateToComment(
  prNumber: number | undefined,
  currentFilePath: string | undefined,
) {
  const navigate = useNavigate();
  const { owner, repo } = useRepoContext();

  return useCallback(
    (filePath: string, line: number) => {
      if (prNumber === undefined) return;
      if (filePath === currentFilePath) {
        scrollToAnchorLine(line);
        return;
      }
      const url = `/repo/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${prNumber}/files/${encodeSegments(filePath)}#L${line}`;
      navigate(url);
    },
    [navigate, owner, repo, prNumber, currentFilePath],
  );
}

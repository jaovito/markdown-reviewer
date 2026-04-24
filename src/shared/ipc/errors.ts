import type { AppError } from "./contract";

export function isAppError(value: unknown): value is AppError {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    typeof (value as { kind: unknown }).kind === "string"
  );
}

export interface AppErrorView {
  title: string;
  description: string;
  actionHint?: string;
}

export function describeError(e: AppError): AppErrorView {
  switch (e.kind) {
    case "invalidPath":
      return {
        title: "Invalid folder",
        description: `We couldn't access ${e.data.path}.`,
        actionHint: "Pick a different folder.",
      };
    case "notAGitRepo":
      return {
        title: "Not a Git repository",
        description: `${e.data.path} is not inside a Git working tree.`,
        actionHint: "Select a folder that contains a .git directory.",
      };
    case "noGithubRemote":
      return {
        title: "No GitHub remote",
        description: "This repository doesn't have a GitHub origin remote.",
        actionHint: "Add a GitHub remote with `git remote add origin …`.",
      };
    case "missingTool":
      return {
        title: `${e.data.name} is not installed`,
        description: `Markdown Reviewer needs \`${e.data.name}\` on your PATH.`,
        actionHint:
          e.data.name === "gh"
            ? "Install GitHub CLI: https://cli.github.com"
            : "Install it from your package manager.",
      };
    case "ghNotAuthenticated":
      return {
        title: "GitHub CLI not authenticated",
        description: "`gh auth status` reports you're not logged in.",
        actionHint: "Run `gh auth login` in your terminal.",
      };
    case "prNotFound":
      return {
        title: "Pull request not found",
        description: `PR #${e.data.number} does not exist on this repo.`,
      };
    case "io":
    case "db":
    case "process":
    case "unexpected":
      return {
        title: "Something went wrong",
        description: e.data.message,
      };
  }
}

import { i18next } from "@/shared/i18n";
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
  const t = i18next.t.bind(i18next);
  switch (e.kind) {
    case "invalidPath":
      return {
        title: t("errors.invalidPath.title"),
        description: t("errors.invalidPath.description", { path: e.data.path }),
        actionHint: t("errors.invalidPath.actionHint"),
      };
    case "notAGitRepo":
      return {
        title: t("errors.notAGitRepo.title"),
        description: t("errors.notAGitRepo.description", { path: e.data.path }),
        actionHint: t("errors.notAGitRepo.actionHint"),
      };
    case "noGithubRemote":
      return {
        title: t("errors.noGithubRemote.title"),
        description: t("errors.noGithubRemote.description"),
        actionHint: t("errors.noGithubRemote.actionHint"),
      };
    case "missingTool":
      return {
        title: t("errors.missingTool.title", { name: e.data.name }),
        description: t("errors.missingTool.description", { name: e.data.name }),
        actionHint:
          e.data.name === "gh"
            ? t("errors.missingTool.actionHintGh")
            : t("errors.missingTool.actionHintGeneric"),
      };
    case "ghNotAuthenticated":
      return {
        title: t("errors.ghNotAuthenticated.title"),
        description: t("errors.ghNotAuthenticated.description"),
        actionHint: t("errors.ghNotAuthenticated.actionHint"),
      };
    case "prNotFound":
      return {
        title: t("errors.prNotFound.title"),
        description: t("errors.prNotFound.description", { number: e.data.number }),
      };
    case "fileNotFound":
      return {
        title: t("errors.fileNotFound.title"),
        description: t("errors.fileNotFound.description", {
          path: e.data.path,
          shortSha: e.data.sha.slice(0, 7),
        }),
        actionHint: t("errors.fileNotFound.actionHint"),
      };
    case "io":
    case "db":
    case "process":
    case "unexpected":
      return {
        title: t("errors.generic.title"),
        description: e.data.message,
      };
  }
}

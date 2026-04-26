import { createLogger } from "@/shared/lib/logger";
import { type Result, err, ok } from "@/shared/lib/result";
import { invoke } from "@tauri-apps/api/core";
import type {
  AppError,
  CommandName,
  Commands,
  CommentAnchor,
  CommentUpdate,
  Repository,
} from "./contract";
import { isAppError } from "./errors";

const log = createLogger("ipc");

async function call<K extends CommandName>(
  name: K,
  args: Commands[K]["args"],
): Promise<Result<Commands[K]["result"], AppError>> {
  try {
    const result = (await invoke(name, args as never)) as Commands[K]["result"];
    return ok(result);
  } catch (raw) {
    if (isAppError(raw)) return err(raw);
    log.error(`invoke(${name}) threw`, raw);
    return err({
      kind: "unexpected",
      data: { message: raw instanceof Error ? raw.message : String(raw) },
    });
  }
}

export const ipc = {
  tools: {
    check: () => call("check_tools", undefined),
    ghUser: () => call("get_gh_user", undefined),
  },
  repo: {
    select: () => call("select_repository", undefined),
    validate: (path: string) => call("validate_repository", { path }),
  },
  recents: {
    list: () => call("list_recent_repositories", undefined),
    add: (repo: Repository) => call("add_recent_repository", { repo }),
    remove: (path: string) => call("remove_recent_repository", { path }),
  },
  pullRequests: {
    list: (repoPath: string) => call("list_pull_requests", { repoPath }),
    load: (repoPath: string, prNumber: number) => call("load_pull_request", { repoPath, prNumber }),
    changedFiles: (repoPath: string, prNumber: number) =>
      call("list_changed_files", { repoPath, prNumber }),
    fileDiff: (repoPath: string, prNumber: number, filePath: string) =>
      call("load_file_diff", { repoPath, prNumber, filePath }),
  },
  files: {
    readMarkdown: (repoPath: string, sha: string, filePath: string) =>
      call("read_markdown_file", { repoPath, sha, filePath }),
  },
  comments: {
    list: (prNumber: number) => call("list_local_comments", { prNumber }),
    listForFile: (prNumber: number, filePath: string) =>
      call("list_local_comments_for_file", { prNumber, filePath }),
    create: (args: {
      prNumber: number;
      filePath: string;
      headSha: string;
      body: string;
      author: string | null;
      anchor: CommentAnchor;
    }) => call("create_local_comment", args),
    update: (id: number, patch: CommentUpdate) => call("update_local_comment", { id, patch }),
    delete: (id: number) => call("delete_local_comment", { id }),
    submitReview: (repoPath: string, prNumber: number, commentIds: number[]) =>
      call("submit_review", { repoPath, prNumber, commentIds }),
  },
};

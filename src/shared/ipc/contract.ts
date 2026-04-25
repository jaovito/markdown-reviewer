/**
 * Source of truth for the IPC boundary. Mirrors:
 *   - `crates/core/src/error.rs`        → AppError
 *   - `crates/core/src/domain/*`        → Repository, ToolStatus, ToolCheck
 *   - `crates/core/src/ports/*`         → RecentRepository
 *   - `crates/ipc/src/commands/*`       → command names + arg/result shapes
 *
 * Keep this file in lockstep with the Rust side until we adopt `ts-rs`/`specta`.
 */

export type ToolCheck =
  | { state: "ok"; detail: string }
  | { state: "missing"; hint: string }
  | { state: "notAuthenticated"; hint: string }
  | { state: "error"; message: string };

export interface ToolStatus {
  git: ToolCheck;
  gh: ToolCheck;
  ghAuth: ToolCheck;
}

export interface Repository {
  path: string;
  remoteUrl: string;
  owner: string;
  repo: string;
  currentBranch: string | null;
}

export interface RecentRepository {
  path: string;
  label: string;
  remoteUrl: string | null;
  owner: string | null;
  repo: string | null;
  lastOpenedAt: number;
}

export type PullRequestState = "open" | "closed" | "merged";

export interface PullRequestSummary {
  number: number;
  title: string;
  author: string;
  baseRef: string;
  headRef: string;
  state: PullRequestState;
  isDraft: boolean;
  updatedAt: string;
  url: string;
}

export interface PullRequestDetail {
  summary: PullRequestSummary;
  body: string | null;
  headSha: string;
  baseSha: string;
  additions: number;
  deletions: number;
  changedFiles: number;
}

export type ChangeStatus =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "copied"
  | "changed"
  | "unchanged";

export interface ChangedFile {
  path: string;
  previousPath: string | null;
  status: ChangeStatus;
  additions: number;
  deletions: number;
}

export type HunkKind = "added" | "modified";

export interface DiffHunk {
  startLine: number;
  endLine: number;
  kind: HunkKind;
}

export interface FileDiff {
  filePath: string;
  headSha: string;
  baseSha: string;
  hunks: DiffHunk[];
}

export type CommentState = "draft" | "submitted" | "hidden" | "resolved" | "deleted";

export type CommentAnchor =
  | { kind: "singleLine"; line: number }
  | { kind: "lineRange"; startLine: number; endLine: number }
  | { kind: "codeBlock"; startLine: number; endLine: number; codeStartLine: number };

export interface ReviewComment {
  id: number;
  prNumber: number;
  filePath: string;
  headSha: string;
  body: string;
  author: string | null;
  state: CommentState;
  anchor: CommentAnchor;
  createdAt: number;
  updatedAt: number;
  githubId: number | null;
  submitError: string | null;
}

export interface CommentUpdate {
  body?: string;
  state?: CommentState;
  anchor?: CommentAnchor;
}

export interface SubmittedReviewComment {
  localId: number;
  githubId: number | null;
  /** When the comment was published successfully. */
  submitted: boolean;
  /** Populated when the comment failed; cleared on success. */
  error: string | null;
}

export interface ReviewSubmissionResult {
  comments: SubmittedReviewComment[];
  /** True when every requested comment was submitted. */
  allSubmitted: boolean;
}

export type AppError =
  | { kind: "invalidPath"; data: { path: string } }
  | { kind: "notAGitRepo"; data: { path: string } }
  | { kind: "noGithubRemote"; data: { path: string } }
  | { kind: "missingTool"; data: { name: string } }
  | { kind: "ghNotAuthenticated" }
  | { kind: "prNotFound"; data: { number: number } }
  | { kind: "fileNotFound"; data: { sha: string; path: string } }
  | { kind: "io"; data: { message: string } }
  | { kind: "db"; data: { message: string } }
  | { kind: "process"; data: { message: string } }
  | { kind: "unexpected"; data: { message: string } };

export interface Commands {
  check_tools: { args: undefined; result: ToolStatus };
  get_gh_user: { args: undefined; result: string | null };
  select_repository: { args: undefined; result: string | null };
  validate_repository: { args: { path: string }; result: Repository };
  list_recent_repositories: { args: undefined; result: RecentRepository[] };
  add_recent_repository: { args: { repo: Repository }; result: RecentRepository };
  remove_recent_repository: { args: { path: string }; result: null };
  list_pull_requests: { args: { repoPath: string }; result: PullRequestSummary[] };
  load_pull_request: {
    args: { repoPath: string; prNumber: number };
    result: PullRequestDetail;
  };
  list_changed_files: {
    args: { repoPath: string; prNumber: number };
    result: ChangedFile[];
  };
  read_markdown_file: {
    args: { repoPath: string; sha: string; filePath: string };
    result: string;
  };
  load_file_diff: {
    args: { repoPath: string; prNumber: number; filePath: string };
    result: FileDiff;
  };
  list_local_comments: {
    args: { prNumber: number };
    result: ReviewComment[];
  };
  list_local_comments_for_file: {
    args: { prNumber: number; filePath: string };
    result: ReviewComment[];
  };
  create_local_comment: {
    args: {
      prNumber: number;
      filePath: string;
      headSha: string;
      body: string;
      author: string | null;
      anchor: CommentAnchor;
    };
    result: ReviewComment;
  };
  update_local_comment: {
    args: { id: number; patch: CommentUpdate };
    result: ReviewComment;
  };
  delete_local_comment: {
    args: { id: number };
    result: null;
  };
  submit_review: {
    args: { repoPath: string; prNumber: number; commentIds: number[] };
    result: ReviewSubmissionResult;
  };
}

export type CommandName = keyof Commands;

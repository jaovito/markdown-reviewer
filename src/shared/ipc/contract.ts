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

export type AppError =
  | { kind: "invalidPath"; data: { path: string } }
  | { kind: "notAGitRepo"; data: { path: string } }
  | { kind: "noGithubRemote"; data: { path: string } }
  | { kind: "missingTool"; data: { name: string } }
  | { kind: "ghNotAuthenticated" }
  | { kind: "prNotFound"; data: { number: number } }
  | { kind: "io"; data: { message: string } }
  | { kind: "db"; data: { message: string } }
  | { kind: "process"; data: { message: string } }
  | { kind: "unexpected"; data: { message: string } };

export interface Commands {
  check_tools: { args: undefined; result: ToolStatus };
  select_repository: { args: undefined; result: string | null };
  validate_repository: { args: { path: string }; result: Repository };
  list_recent_repositories: { args: undefined; result: RecentRepository[] };
  add_recent_repository: { args: { repo: Repository }; result: RecentRepository };
  remove_recent_repository: { args: { path: string }; result: null };
}

export type CommandName = keyof Commands;

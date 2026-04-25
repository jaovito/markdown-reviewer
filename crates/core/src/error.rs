use serde::{Deserialize, Serialize};
use thiserror::Error;

pub type AppResult<T> = Result<T, AppError>;

#[derive(Debug, Error, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", content = "data", rename_all = "camelCase")]
pub enum AppError {
    #[error("path does not exist or is not accessible")]
    InvalidPath { path: String },

    #[error("not a git repository")]
    NotAGitRepo { path: String },

    #[error("repository has no GitHub remote")]
    NoGithubRemote { path: String },

    #[error("required tool `{name}` is missing")]
    MissingTool { name: String },

    #[error("GitHub CLI is not authenticated")]
    GhNotAuthenticated,

    #[error("pull request not found")]
    PrNotFound { number: u64 },

    #[error("file not found at ref")]
    FileNotFound { sha: String, path: String },

    #[error("I/O error: {message}")]
    Io { message: String },

    #[error("database error: {message}")]
    Db { message: String },

    #[error("process error: {message}")]
    Process { message: String },

    #[error("unexpected error: {message}")]
    Unexpected { message: String },
}

impl AppError {
    pub fn io(err: impl std::fmt::Display) -> Self {
        Self::Io {
            message: err.to_string(),
        }
    }
    pub fn db(err: impl std::fmt::Display) -> Self {
        Self::Db {
            message: err.to_string(),
        }
    }
    pub fn process(err: impl std::fmt::Display) -> Self {
        Self::Process {
            message: err.to_string(),
        }
    }
    pub fn unexpected(err: impl std::fmt::Display) -> Self {
        Self::Unexpected {
            message: err.to_string(),
        }
    }
}

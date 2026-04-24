use async_trait::async_trait;
use markdown_reviewer_core::ports::GitClient;
use markdown_reviewer_core::{AppError, AppResult};

use crate::process::{run, run_ok};

const TIMEOUT_MS: u64 = 5_000;

#[derive(Debug, Default, Clone)]
pub struct GitCli;

#[async_trait]
impl GitClient for GitCli {
    async fn version(&self) -> AppResult<String> {
        match run_ok("git", &["--version"], None, TIMEOUT_MS).await {
            Ok(out) => Ok(out.stdout.trim().to_string()),
            Err(AppError::MissingTool { .. }) => Err(AppError::MissingTool { name: "git".into() }),
            Err(e) => Err(e),
        }
    }

    async fn is_git_repo(&self, path: &str) -> AppResult<bool> {
        let out = run(
            "git",
            &["-C", path, "rev-parse", "--is-inside-work-tree"],
            None,
            TIMEOUT_MS,
        )
        .await?;
        Ok(out.ok() && out.stdout.trim() == "true")
    }

    async fn remote_origin_url(&self, path: &str) -> AppResult<Option<String>> {
        let out = run(
            "git",
            &["-C", path, "remote", "get-url", "origin"],
            None,
            TIMEOUT_MS,
        )
        .await?;
        if out.ok() {
            let url = out.stdout.trim().to_string();
            Ok((!url.is_empty()).then_some(url))
        } else {
            Ok(None)
        }
    }

    async fn current_branch(&self, path: &str) -> AppResult<Option<String>> {
        let out = run(
            "git",
            &["-C", path, "symbolic-ref", "--quiet", "--short", "HEAD"],
            None,
            TIMEOUT_MS,
        )
        .await?;
        if !out.ok() {
            return Ok(None);
        }
        let b = out.stdout.trim().to_string();
        Ok((!b.is_empty()).then_some(b))
    }
}

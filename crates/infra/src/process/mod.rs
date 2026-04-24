mod redact;

use std::process::Stdio;
use std::time::Duration;

use markdown_reviewer_core::{AppError, AppResult};
use tokio::process::Command;
use tokio::time::timeout;

pub use redact::redact;

#[derive(Debug, Clone)]
pub struct CommandOutput {
    pub status: i32,
    pub stdout: String,
    pub stderr: String,
}

impl CommandOutput {
    pub fn ok(&self) -> bool {
        self.status == 0
    }
}

/// Runs a command with a fixed argv and no shell interpretation.
/// `cwd` is optional.
pub async fn run(
    program: &str,
    args: &[&str],
    cwd: Option<&str>,
    timeout_ms: u64,
) -> AppResult<CommandOutput> {
    let mut cmd = Command::new(program);
    cmd.args(args);
    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }
    cmd.stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null());

    let fut = cmd.output();
    let out = match timeout(Duration::from_millis(timeout_ms), fut).await {
        Ok(Ok(o)) => o,
        Ok(Err(e)) => {
            if e.kind() == std::io::ErrorKind::NotFound {
                return Err(AppError::MissingTool {
                    name: program.to_string(),
                });
            }
            return Err(AppError::process(redact(&e.to_string())));
        }
        Err(_) => {
            return Err(AppError::process(format!(
                "`{program}` timed out after {timeout_ms}ms"
            )))
        }
    };

    let output = CommandOutput {
        status: out.status.code().unwrap_or(-1),
        stdout: String::from_utf8_lossy(&out.stdout).to_string(),
        stderr: String::from_utf8_lossy(&out.stderr).to_string(),
    };

    tracing::debug!(
        program,
        args = ?args,
        status = output.status,
        stdout_len = output.stdout.len(),
        stderr = %redact(&output.stderr),
        "process exited"
    );

    Ok(output)
}

/// Same as `run` but returns `Err` when the command exits non-zero.
pub async fn run_ok(
    program: &str,
    args: &[&str],
    cwd: Option<&str>,
    timeout_ms: u64,
) -> AppResult<CommandOutput> {
    let out = run(program, args, cwd, timeout_ms).await?;
    if !out.ok() {
        return Err(AppError::process(format!(
            "`{}` exited with status {}: {}",
            program,
            out.status,
            redact(out.stderr.trim())
        )));
    }
    Ok(out)
}

use crate::domain::{ToolCheck, ToolStatus};
use crate::AppResult;

use super::RepoSelection;

const GIT_HINT: &str = "Install Git: https://git-scm.com/downloads";
const GH_HINT: &str = "Install GitHub CLI: https://cli.github.com";
const GH_AUTH_HINT: &str = "Run `gh auth login` in your terminal";

pub async fn check_tools(svc: &RepoSelection) -> AppResult<ToolStatus> {
    let git = match svc.git.version().await {
        Ok(v) => ToolCheck::ok(v),
        Err(_) => ToolCheck::missing(GIT_HINT),
    };

    let gh = match svc.gh.version().await {
        Ok(v) => ToolCheck::ok(v),
        Err(_) => ToolCheck::missing(GH_HINT),
    };

    let gh_auth = if gh.is_ok() {
        match svc.gh.auth_status().await {
            Ok(report) if report.authenticated => ToolCheck::ok(
                report
                    .username
                    .unwrap_or_else(|| "authenticated".to_string()),
            ),
            Ok(_) | Err(_) => ToolCheck::not_authenticated(GH_AUTH_HINT),
        }
    } else {
        ToolCheck::missing(GH_HINT)
    };

    Ok(ToolStatus { git, gh, gh_auth })
}

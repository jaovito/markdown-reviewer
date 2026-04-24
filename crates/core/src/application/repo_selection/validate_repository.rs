use crate::domain::{RemoteUrl, Repository};
use crate::{AppError, AppResult};

use super::RepoSelection;

pub async fn validate_repository(svc: &RepoSelection, path: &str) -> AppResult<Repository> {
    let path_trim = path.trim();
    if path_trim.is_empty() {
        return Err(AppError::InvalidPath {
            path: path.to_string(),
        });
    }

    if !svc.git.is_git_repo(path_trim).await.unwrap_or(false) {
        return Err(AppError::NotAGitRepo {
            path: path_trim.to_string(),
        });
    }

    let remote =
        svc.git
            .remote_origin_url(path_trim)
            .await?
            .ok_or_else(|| AppError::NoGithubRemote {
                path: path_trim.to_string(),
            })?;

    let parsed = RemoteUrl::parse_github(&remote).ok_or_else(|| AppError::NoGithubRemote {
        path: path_trim.to_string(),
    })?;

    let branch = svc.git.current_branch(path_trim).await.unwrap_or(None);

    Ok(Repository {
        path: path_trim.to_string(),
        remote_url: parsed.raw,
        owner: parsed.owner,
        repo: parsed.repo,
        current_branch: branch,
    })
}

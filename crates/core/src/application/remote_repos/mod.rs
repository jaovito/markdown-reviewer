use std::path::Path;

use crate::application::repo_selection::{recents, validate_repository};
use crate::domain::{RemoteRepository, Repository};
use crate::AppError;
use crate::AppResult;

use super::repo_selection::RepoSelection;

pub async fn list_user_repositories(
    svc: &RepoSelection,
    query: Option<&str>,
    limit: u32,
) -> AppResult<Vec<RemoteRepository>> {
    svc.gh.list_user_repositories(query, limit).await
}

pub async fn clone_repository(
    svc: &RepoSelection,
    repo_name_with_owner: &str,
    target_parent_dir: &str,
) -> AppResult<Repository> {
    let parts: Vec<&str> = repo_name_with_owner.split('/').collect();
    let repo_name = if parts.len() == 2 {
        parts[1]
    } else {
        repo_name_with_owner
    };

    let parent_path = Path::new(target_parent_dir);
    if !parent_path.exists() || !parent_path.is_dir() {
        return Err(AppError::validation(format!(
            "Target directory does not exist or is not a folder: {}",
            target_parent_dir
        )));
    }

    let target_path = parent_path.join(repo_name);
    let target_dir_str = target_path.to_string_lossy().to_string();

    svc.gh
        .clone_repository(repo_name_with_owner, &target_dir_str)
        .await?;

    let validated = validate_repository::validate_repository(svc, &target_dir_str).await?;
    let _ = recents::add(svc, &validated).await?;

    Ok(validated)
}

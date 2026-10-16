use std::path::Path;

use crate::application::repo_selection::{recents, validate_repository};
use crate::domain::{RemoteRepository, Repository};
use crate::AppError;
use crate::AppResult;

use super::repo_selection::RepoSelection;

pub fn parse_repo_name_with_owner(raw: &str) -> AppResult<(&str, &str)> {
    let mut parts = raw.split('/');
    let owner = parts.next().filter(|s| !s.is_empty());
    let name = parts.next().filter(|s| !s.is_empty());
    if parts.next().is_some() || owner.is_none() || name.is_none() {
        return Err(AppError::validation(format!(
            "Invalid repository name '{raw}'; expected 'owner/name' format"
        )));
    }
    let (owner, name) = (owner.unwrap(), name.unwrap());
    let is_valid_char = |c: char| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.';
    if !owner.chars().all(is_valid_char)
        || !name.chars().all(is_valid_char)
        || name == "."
        || name == ".."
    {
        return Err(AppError::validation(format!(
            "Invalid repository name '{raw}'"
        )));
    }
    Ok((owner, name))
}

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
    let (_owner, repo_name) = parse_repo_name_with_owner(repo_name_with_owner)?;

    let target_path = Path::new(target_parent_dir).join(repo_name);
    let target_dir_str = target_path.to_string_lossy().to_string();

    svc.gh
        .clone_repository(repo_name_with_owner, &target_dir_str)
        .await?;

    let validated = validate_repository::validate_repository(svc, &target_dir_str).await?;
    let _ = recents::add(svc, &validated).await?;

    Ok(validated)
}

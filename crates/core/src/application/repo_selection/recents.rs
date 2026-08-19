use crate::domain::Repository;
use crate::ports::RecentRepository;
use crate::AppResult;

use super::RepoSelection;

pub async fn list(svc: &RepoSelection) -> AppResult<Vec<RecentRepository>> {
    svc.recents.list().await
}

pub async fn add(svc: &RepoSelection, repo: &Repository) -> AppResult<RecentRepository> {
    let existing = svc.recents.list().await.unwrap_or_default();
    let pinned = existing
        .into_iter()
        .find(|r| r.path == repo.path)
        .map(|r| r.pinned)
        .unwrap_or(false);

    let entry = RecentRepository {
        path: repo.path.clone(),
        label: format!("{}/{}", repo.owner, repo.repo),
        remote_url: Some(repo.remote_url.clone()),
        owner: Some(repo.owner.clone()),
        repo: Some(repo.repo.clone()),
        last_opened_at: svc.clock.now_unix_ms(),
        pinned,
    };
    svc.recents.upsert(entry.clone()).await?;
    Ok(entry)
}

pub async fn remove(svc: &RepoSelection, path: &str) -> AppResult<()> {
    svc.recents.remove(path).await
}

pub async fn set_pinned(svc: &RepoSelection, path: &str, pinned: bool) -> AppResult<()> {
    svc.recents.set_pinned(path, pinned).await
}

pub async fn clear_all(svc: &RepoSelection) -> AppResult<()> {
    svc.recents.clear_all().await
}

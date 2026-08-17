use std::sync::Arc;

use async_trait::async_trait;
use markdown_reviewer_core::application::remote_repos;
use markdown_reviewer_core::application::repo_selection::RepoSelection;
use markdown_reviewer_core::domain::RemoteRepository;
use markdown_reviewer_core::ports::{
    Clock, GhAuthReport, GhClient, GitClient, RecentRepository, RecentsStore, ReviewCommentInput,
};
use markdown_reviewer_core::AppResult;
use time::OffsetDateTime;

struct FixedClock;
impl Clock for FixedClock {
    fn now(&self) -> OffsetDateTime {
        OffsetDateTime::from_unix_timestamp(1_700_000_000).unwrap()
    }
}

struct DummyGit;
#[async_trait]
impl GitClient for DummyGit {
    async fn version(&self) -> AppResult<String> {
        Ok("git version 2.43.0".into())
    }
    async fn is_git_repo(&self, _path: &str) -> AppResult<bool> {
        Ok(true)
    }
    async fn remote_origin_url(&self, _path: &str) -> AppResult<Option<String>> {
        Ok(Some("git@github.com:owner/repo.git".to_string()))
    }
    async fn current_branch(&self, _path: &str) -> AppResult<Option<String>> {
        Ok(Some("main".to_string()))
    }
    async fn show_file(
        &self,
        _repo_path: &str,
        _sha: &str,
        _file_path: &str,
    ) -> AppResult<Option<String>> {
        Ok(None)
    }
    async fn diff_hunks(
        &self,
        _repo_path: &str,
        _base: &str,
        _head: &str,
        _file_path: &str,
    ) -> AppResult<Option<Vec<markdown_reviewer_core::domain::DiffHunk>>> {
        Ok(Some(Vec::new()))
    }
}

#[derive(Default)]
struct DummyRecents;
#[async_trait]
impl RecentsStore for DummyRecents {
    async fn list(&self) -> AppResult<Vec<RecentRepository>> {
        Ok(Vec::new())
    }
    async fn upsert(&self, _entry: RecentRepository) -> AppResult<()> {
        Ok(())
    }
    async fn remove(&self, _path: &str) -> AppResult<()> {
        Ok(())
    }
}

struct MockGh;
#[async_trait]
impl GhClient for MockGh {
    async fn version(&self) -> AppResult<String> {
        Ok("gh version 2.50.0".to_string())
    }
    async fn auth_status(&self) -> AppResult<GhAuthReport> {
        Ok(GhAuthReport {
            authenticated: true,
            username: Some("user".to_string()),
            detail: "".to_string(),
        })
    }
    async fn list_pull_requests(
        &self,
        _repo_path: &str,
    ) -> AppResult<Vec<markdown_reviewer_core::domain::PullRequestSummary>> {
        Ok(Vec::new())
    }
    async fn load_pull_request(
        &self,
        _repo_path: &str,
        _number: u64,
    ) -> AppResult<markdown_reviewer_core::domain::PullRequestDetail> {
        unimplemented!()
    }
    async fn list_changed_files(
        &self,
        _repo_path: &str,
        _number: u64,
    ) -> AppResult<Vec<markdown_reviewer_core::domain::ChangedFile>> {
        Ok(Vec::new())
    }
    async fn get_file_content(
        &self,
        _repo_path: &str,
        _sha: &str,
        _file_path: &str,
    ) -> AppResult<String> {
        Ok("".to_string())
    }
    async fn submit_review_batch(
        &self,
        _repo_path: &str,
        _pr_number: u64,
        _head_sha: &str,
        _comments: &[ReviewCommentInput],
    ) -> AppResult<Vec<i64>> {
        Ok(Vec::new())
    }
    async fn submit_review_comment(
        &self,
        _repo_path: &str,
        _pr_number: u64,
        _head_sha: &str,
        _comment: &ReviewCommentInput,
    ) -> AppResult<i64> {
        Ok(1)
    }
    async fn list_review_threads(
        &self,
        _repo_path: &str,
        _pr_number: u64,
    ) -> AppResult<markdown_reviewer_core::ports::FetchedReviewThreads> {
        Ok(markdown_reviewer_core::ports::FetchedReviewThreads {
            threads: Vec::new(),
            truncated: false,
        })
    }
    async fn reply_review_comment(
        &self,
        _repo_path: &str,
        _pr_number: u64,
        _in_reply_to_comment_id: i64,
        _body: &str,
    ) -> AppResult<markdown_reviewer_core::domain::RemoteComment> {
        unimplemented!()
    }
    async fn edit_review_comment(
        &self,
        _repo_path: &str,
        _comment_id: i64,
        _body: &str,
    ) -> AppResult<markdown_reviewer_core::domain::RemoteComment> {
        unimplemented!()
    }
    async fn delete_review_comment(&self, _repo_path: &str, _comment_id: i64) -> AppResult<()> {
        Ok(())
    }
    async fn resolve_review_thread(
        &self,
        _repo_path: &str,
        _thread_id: &str,
    ) -> AppResult<markdown_reviewer_core::domain::RemoteThread> {
        unimplemented!()
    }
    async fn unresolve_review_thread(
        &self,
        _repo_path: &str,
        _thread_id: &str,
    ) -> AppResult<markdown_reviewer_core::domain::RemoteThread> {
        unimplemented!()
    }

    async fn list_user_repositories(
        &self,
        query: Option<&str>,
        _limit: u32,
    ) -> AppResult<Vec<RemoteRepository>> {
        let repos = vec![
            RemoteRepository {
                name: "markdown-reviewer".to_string(),
                name_with_owner: "jaovito/markdown-reviewer".to_string(),
                description: "Desktop app".to_string(),
                url: "https://github.com/jaovito/markdown-reviewer".to_string(),
                is_private: false,
                is_fork: false,
                stargazer_count: 5,
                updated_at: "2026-08-09T00:00:00Z".to_string(),
                primary_language: Some("TypeScript".to_string()),
                default_branch: "main".to_string(),
            },
            RemoteRepository {
                name: "notes".to_string(),
                name_with_owner: "jaovito/notes".to_string(),
                description: "Personal notes".to_string(),
                url: "https://github.com/jaovito/notes".to_string(),
                is_private: true,
                is_fork: false,
                stargazer_count: 0,
                updated_at: "2026-05-01T00:00:00Z".to_string(),
                primary_language: None,
                default_branch: "main".to_string(),
            },
        ];

        if let Some(q) = query {
            let q_lower = q.to_lowercase();
            Ok(repos
                .into_iter()
                .filter(|r| {
                    r.name.contains(&q_lower) || r.description.to_lowercase().contains(&q_lower)
                })
                .collect())
        } else {
            Ok(repos)
        }
    }

    async fn clone_repository(
        &self,
        _repo_name_with_owner: &str,
        _target_dir: &str,
    ) -> AppResult<()> {
        Ok(())
    }
}

#[tokio::test]
async fn test_list_user_repositories() {
    let svc = RepoSelection {
        git: Arc::new(DummyGit),
        gh: Arc::new(MockGh),
        recents: Arc::new(DummyRecents),
        clock: Arc::new(FixedClock),
    };

    let all = remote_repos::list_user_repositories(&svc, None, 100)
        .await
        .unwrap();
    assert_eq!(all.len(), 2);

    let filtered = remote_repos::list_user_repositories(&svc, Some("markdown"), 100)
        .await
        .unwrap();
    assert_eq!(filtered.len(), 1);
    assert_eq!(filtered[0].name, "markdown-reviewer");
}

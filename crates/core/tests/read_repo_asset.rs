use std::sync::Arc;

use async_trait::async_trait;
use markdown_reviewer_core::application::files::{read_repo_asset, Files, MAX_ASSET_BYTES};
use markdown_reviewer_core::ports::{GhAuthReport, GhClient, GitClient, ReviewCommentInput};
use markdown_reviewer_core::{AppError, AppResult};

struct FakeGit {
    bytes: Option<Vec<u8>>,
}

impl FakeGit {
    fn with_bytes(bytes: Option<Vec<u8>>) -> Self {
        Self { bytes }
    }
}

#[async_trait]
impl GitClient for FakeGit {
    async fn version(&self) -> AppResult<String> {
        unimplemented!("not used in this test")
    }
    async fn is_git_repo(&self, _path: &str) -> AppResult<bool> {
        unimplemented!("not used in this test")
    }
    async fn remote_origin_url(&self, _path: &str) -> AppResult<Option<String>> {
        unimplemented!("not used in this test")
    }
    async fn current_branch(&self, _path: &str) -> AppResult<Option<String>> {
        unimplemented!("not used in this test")
    }
    async fn show_file(
        &self,
        _repo_path: &str,
        _sha: &str,
        _file_path: &str,
    ) -> AppResult<Option<String>> {
        unimplemented!("not used in this test")
    }
    async fn show_file_bytes(
        &self,
        _repo_path: &str,
        _sha: &str,
        _file_path: &str,
    ) -> AppResult<Option<Vec<u8>>> {
        Ok(self.bytes.clone())
    }
    async fn diff_hunks(
        &self,
        _repo_path: &str,
        _base: &str,
        _head: &str,
        _file_path: &str,
    ) -> AppResult<Option<Vec<markdown_reviewer_core::domain::DiffHunk>>> {
        unimplemented!("not used in this test")
    }
}

struct FakeGh {
    bytes: AppResult<Vec<u8>>,
}

impl FakeGh {
    fn with_bytes(bytes: Vec<u8>) -> Self {
        Self { bytes: Ok(bytes) }
    }

    fn failing() -> Self {
        Self {
            bytes: Err(AppError::FileNotFound {
                sha: "abc".into(),
                path: "nope.png".into(),
            }),
        }
    }
}

#[async_trait]
impl GhClient for FakeGh {
    async fn version(&self) -> AppResult<String> {
        unimplemented!("not used in this test")
    }
    async fn auth_status(&self) -> AppResult<GhAuthReport> {
        unimplemented!("not used in this test")
    }
    async fn list_pull_requests(
        &self,
        _repo_path: &str,
    ) -> AppResult<Vec<markdown_reviewer_core::domain::PullRequestSummary>> {
        unimplemented!("not used in this test")
    }
    async fn load_pull_request(
        &self,
        _repo_path: &str,
        _number: u64,
    ) -> AppResult<markdown_reviewer_core::domain::PullRequestDetail> {
        unimplemented!("not used in this test")
    }
    async fn list_changed_files(
        &self,
        _repo_path: &str,
        _number: u64,
    ) -> AppResult<Vec<markdown_reviewer_core::domain::ChangedFile>> {
        unimplemented!("not used in this test")
    }
    async fn get_file_content(
        &self,
        _repo_path: &str,
        _sha: &str,
        _file_path: &str,
    ) -> AppResult<String> {
        unimplemented!("not used in this test")
    }
    async fn get_file_bytes(
        &self,
        _repo_path: &str,
        _sha: &str,
        _file_path: &str,
    ) -> AppResult<Vec<u8>> {
        self.bytes.clone()
    }
    async fn submit_review_batch(
        &self,
        _repo_path: &str,
        _pr_number: u64,
        _head_sha: &str,
        _comments: &[ReviewCommentInput],
    ) -> AppResult<Vec<i64>> {
        unimplemented!("not used in this test")
    }
    async fn submit_review_comment(
        &self,
        _repo_path: &str,
        _pr_number: u64,
        _head_sha: &str,
        _comment: &ReviewCommentInput,
    ) -> AppResult<i64> {
        unimplemented!("not used in this test")
    }
    async fn list_review_threads(
        &self,
        _repo_path: &str,
        _pr_number: u64,
    ) -> AppResult<markdown_reviewer_core::ports::FetchedReviewThreads> {
        unimplemented!("not used in this test")
    }
    async fn reply_review_comment(
        &self,
        _repo_path: &str,
        _pr_number: u64,
        _in_reply_to_comment_id: i64,
        _body: &str,
    ) -> AppResult<markdown_reviewer_core::domain::RemoteComment> {
        unimplemented!("not used in this test")
    }
    async fn edit_review_comment(
        &self,
        _repo_path: &str,
        _comment_id: i64,
        _body: &str,
    ) -> AppResult<markdown_reviewer_core::domain::RemoteComment> {
        unimplemented!("not used in this test")
    }
    async fn delete_review_comment(&self, _repo_path: &str, _comment_id: i64) -> AppResult<()> {
        unimplemented!("not used in this test")
    }
    async fn resolve_review_thread(
        &self,
        _repo_path: &str,
        _thread_id: &str,
    ) -> AppResult<markdown_reviewer_core::domain::RemoteThread> {
        unimplemented!("not used in this test")
    }
    async fn unresolve_review_thread(
        &self,
        _repo_path: &str,
        _thread_id: &str,
    ) -> AppResult<markdown_reviewer_core::domain::RemoteThread> {
        unimplemented!("not used in this test")
    }
}

fn svc(git: FakeGit, gh: FakeGh) -> Files {
    Files {
        git: Arc::new(git),
        gh: Arc::new(gh),
    }
}

#[tokio::test]
async fn returns_local_bytes_when_git_has_them() {
    let s = svc(
        FakeGit::with_bytes(Some(vec![1, 2, 3])),
        FakeGh::with_bytes(vec![9, 9, 9]),
    );
    let got = read_repo_asset(&s, "/repo", "abc", "docs/a.png")
        .await
        .unwrap();
    assert_eq!(got, vec![1, 2, 3]);
}

#[tokio::test]
async fn falls_back_to_github_when_git_misses() {
    let s = svc(FakeGit::with_bytes(None), FakeGh::with_bytes(vec![7, 7]));
    let got = read_repo_asset(&s, "/repo", "abc", "docs/a.png")
        .await
        .unwrap();
    assert_eq!(got, vec![7, 7]);
}

#[tokio::test]
async fn propagates_the_github_error_when_both_miss() {
    let s = svc(FakeGit::with_bytes(None), FakeGh::failing());
    let err = read_repo_asset(&s, "/repo", "abc", "nope.png")
        .await
        .unwrap_err();
    assert!(matches!(err, AppError::FileNotFound { .. }));
}

#[tokio::test]
async fn rejects_an_asset_over_the_size_cap() {
    let huge = vec![0u8; MAX_ASSET_BYTES + 1];
    let s = svc(FakeGit::with_bytes(Some(huge)), FakeGh::with_bytes(vec![]));
    let err = read_repo_asset(&s, "/repo", "abc", "big.png")
        .await
        .unwrap_err();
    assert!(matches!(err, AppError::Validation { .. }));
}

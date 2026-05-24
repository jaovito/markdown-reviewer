//! Parser tests for the GraphQL `reviewThreads` payload. The fixture is
//! a hand-crafted but realistic response; the `gh_cli` round-trip is
//! covered by an opt-in #[ignore] smoke test below.

use markdown_reviewer_core::domain::ThreadState;
use markdown_reviewer_infra::gh::review_threads::parse_review_threads;

#[test]
fn parses_basic_fixture() {
    let raw = include_str!("fixtures/gh/review-threads-basic.json");
    let fetched = parse_review_threads(raw).expect("fixture parses");
    assert_eq!(fetched.threads.len(), 2);
    assert!(!fetched.truncated);

    let t1 = &fetched.threads[0];
    assert_eq!(t1.thread_id, "PRRT_kwDOA1");
    assert_eq!(t1.path, "docs/intro.md");
    assert_eq!(t1.line, Some(4));
    assert_eq!(t1.start_line, None);
    assert_eq!(t1.original_line, 4);
    assert_eq!(t1.state, ThreadState::Open);
    assert!(t1.viewer_can_resolve);
    assert_eq!(t1.comments.len(), 1);
    assert_eq!(t1.comments[0].comment_id, 1001);
    assert_eq!(t1.comments[0].author, "alice");
    assert!(t1.comments[0].viewer_can_update);

    let t2 = &fetched.threads[1];
    assert_eq!(t2.thread_id, "PRRT_kwDOA2");
    assert_eq!(t2.state, ThreadState::Resolved);
    assert_eq!(t2.start_line, Some(8));
    assert_eq!(t2.line, Some(10));
    assert!(!t2.comments[0].viewer_can_update);
}

use crate::domain::{CommentState, ReviewComment};
use crate::ports::{
    ReviewCommentInput, ReviewSubmissionResult, SubmitOutcome, SubmittedReviewComment,
};
use crate::AppResult;

use super::Comments;

/// Outcome we hold per requested id while assembling the response. Keeps the
/// original input order regardless of which path (idempotent / batch /
/// fallback) produced the result.
enum Slot {
    /// Already published in a previous submit. Skipped without hitting `gh`.
    AlreadySubmitted { github_id: i64 },
    /// Soft-deleted or missing — reported as a no-op failure so the UI can
    /// surface it instead of silently dropping the request.
    Skipped { reason: String },
    /// Mismatched `head_sha` against the batch — fall back to per-comment.
    MixedHead,
    /// Eligible for submission. Holds the input the gh layer needs.
    Pending { input: ReviewCommentInput },
}

pub async fn run(
    svc: &Comments,
    repo_path: &str,
    pr_number: u64,
    comment_ids: &[i64],
) -> AppResult<ReviewSubmissionResult> {
    // 1. Fetch every requested comment, classify, and collect the head_sha
    //    candidates so we can decide whether a single batch is safe.
    let mut slots: Vec<(i64, Slot)> = Vec::with_capacity(comment_ids.len());
    let mut head_shas: Vec<String> = Vec::new();

    for &id in comment_ids {
        let fetched = svc.store.get(id).await?;
        let slot = classify(id, fetched, &mut head_shas);
        slots.push((id, slot));
    }

    // 2. Decide whether the whole pending set shares one head_sha. If not,
    //    flip every Pending into MixedHead so we go straight to per-comment.
    let unique_heads: std::collections::BTreeSet<&String> = head_shas.iter().collect();
    let single_head: Option<String> = if unique_heads.len() == 1 {
        head_shas.first().cloned()
    } else {
        None
    };
    if single_head.is_none() {
        for (_, slot) in &mut slots {
            if matches!(slot, Slot::Pending { .. }) {
                *slot = Slot::MixedHead;
            }
        }
    }

    // 3. Try the batch endpoint when we have a homogeneous, non-empty pending
    //    set. Failure here just means we fall back per comment; we never
    //    bubble the batch error up to the caller.
    let pending_inputs: Vec<ReviewCommentInput> = slots
        .iter()
        .filter_map(|(_, s)| match s {
            Slot::Pending { input } => Some(input.clone()),
            _ => None,
        })
        .collect();

    let mut batch_ids: Option<Vec<i64>> = None;
    if let (Some(head), false) = (single_head.as_ref(), pending_inputs.is_empty()) {
        // Either an Err or an unexpected-length Ok falls through to the
        // per-comment fallback path; the only success case worth taking is a
        // length-matching list of ids we can zip in input order.
        if let Ok(ids) = svc
            .gh
            .submit_review_batch(repo_path, pr_number, head, &pending_inputs)
            .await
        {
            if ids.len() == pending_inputs.len() {
                batch_ids = Some(ids);
            }
        }
    }

    // 4. Walk the slots in input order, dispatching to whichever publication
    //    path applies to each.
    let mut results: Vec<SubmittedReviewComment> = Vec::with_capacity(slots.len());
    let now = svc.clock.now_unix_ms();
    let mut batch_iter = batch_ids.into_iter().flatten();

    for (id, slot) in slots {
        let entry = match slot {
            Slot::AlreadySubmitted { github_id } => SubmittedReviewComment {
                local_id: id,
                github_id: Some(github_id),
                submitted: true,
                error: None,
            },
            Slot::Skipped { reason } => SubmittedReviewComment {
                local_id: id,
                github_id: None,
                submitted: false,
                error: Some(reason),
            },
            Slot::Pending { input } => {
                if let Some(github_id) = batch_iter.next() {
                    svc.store
                        .record_submit(
                            id,
                            SubmitOutcome {
                                github_id: Some(github_id),
                                submit_error: None,
                            },
                            now,
                        )
                        .await?;
                    SubmittedReviewComment {
                        local_id: id,
                        github_id: Some(github_id),
                        submitted: true,
                        error: None,
                    }
                } else {
                    // Batch failed (or never ran for a single-head set that
                    // tripped a length mismatch). The head must exist if we
                    // reached Pending classification.
                    let head = single_head
                        .as_deref()
                        .expect("Pending slot implies a resolved head_sha");
                    submit_single(svc, repo_path, pr_number, head, &input, id, now).await?
                }
            }
            Slot::MixedHead => {
                // Re-fetch so we have the latest head_sha for this comment;
                // the classify pass already held one but burying it in the
                // enum would couple unrelated branches.
                match svc.store.get(id).await? {
                    Some(comment) => {
                        let input = build_input(id, &comment);
                        submit_single(
                            svc,
                            repo_path,
                            pr_number,
                            &comment.head_sha,
                            &input,
                            id,
                            now,
                        )
                        .await?
                    }
                    None => SubmittedReviewComment {
                        local_id: id,
                        github_id: None,
                        submitted: false,
                        error: Some(format!("local comment {id} not found")),
                    },
                }
            }
        };
        results.push(entry);
    }

    let all_submitted = results.iter().all(|r| r.submitted);
    Ok(ReviewSubmissionResult {
        comments: results,
        all_submitted,
    })
}

fn classify(id: i64, fetched: Option<ReviewComment>, head_shas: &mut Vec<String>) -> Slot {
    let Some(comment) = fetched else {
        return Slot::Skipped {
            reason: format!("local comment {id} not found"),
        };
    };
    // Already-published comments are reported as success (idempotent retry).
    if let Some(github_id) = comment.github_id {
        return Slot::AlreadySubmitted { github_id };
    }
    // Only drafts are submitted. Anything else is reported back so the UI
    // doesn't silently turn `hidden`/`resolved` rows into remote comments.
    if !matches!(comment.state, CommentState::Draft) {
        return Slot::Skipped {
            reason: format!(
                "local comment {id} is {} (only drafts are submitted)",
                comment.state.as_str()
            ),
        };
    }
    head_shas.push(comment.head_sha.clone());
    Slot::Pending {
        input: build_input(id, &comment),
    }
}

fn build_input(id: i64, comment: &ReviewComment) -> ReviewCommentInput {
    let start = comment.anchor.start_line();
    let end = comment.anchor.end_line();
    ReviewCommentInput {
        local_id: id,
        path: comment.file_path.clone(),
        line: end,
        start_line: if start < end { Some(start) } else { None },
        body: comment.body.clone(),
    }
}

async fn submit_single(
    svc: &Comments,
    repo_path: &str,
    pr_number: u64,
    head_sha: &str,
    input: &ReviewCommentInput,
    id: i64,
    now: i64,
) -> AppResult<SubmittedReviewComment> {
    match svc
        .gh
        .submit_review_comment(repo_path, pr_number, head_sha, input)
        .await
    {
        Ok(github_id) => {
            svc.store
                .record_submit(
                    id,
                    SubmitOutcome {
                        github_id: Some(github_id),
                        submit_error: None,
                    },
                    now,
                )
                .await?;
            Ok(SubmittedReviewComment {
                local_id: id,
                github_id: Some(github_id),
                submitted: true,
                error: None,
            })
        }
        Err(err) => {
            let message = err.to_string();
            svc.store
                .record_submit(
                    id,
                    SubmitOutcome {
                        github_id: None,
                        submit_error: Some(message.clone()),
                    },
                    now,
                )
                .await?;
            Ok(SubmittedReviewComment {
                local_id: id,
                github_id: None,
                submitted: false,
                error: Some(message),
            })
        }
    }
}

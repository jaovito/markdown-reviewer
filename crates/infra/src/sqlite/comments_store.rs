use async_trait::async_trait;
use markdown_reviewer_core::domain::{
    CommentAnchor, CommentState, CommentUpdate, ReviewComment,
};
use markdown_reviewer_core::ports::{CommentsStore, NewComment, SubmitOutcome};
use markdown_reviewer_core::{AppError, AppResult};
use rusqlite::{params, Connection, Row};

use super::Db;

pub struct SqliteCommentsStore {
    db: Db,
}

impl SqliteCommentsStore {
    pub fn new(db: Db) -> Self {
        Self { db }
    }
}

const SELECT_COLS: &str = "id, pr_number, file_path, head_sha, body, author, state, \
    anchor_kind, anchor_data, anchor_start_line, anchor_end_line, \
    created_at, updated_at, github_id, submit_error";

fn row_to_comment(row: &Row<'_>) -> rusqlite::Result<ReviewComment> {
    let anchor_kind: String = row.get(7)?;
    let anchor_data: String = row.get(8)?;
    let anchor_start_line: i64 = row.get(9)?;
    let anchor_end_line: i64 = row.get(10)?;
    let anchor = decode_anchor(&anchor_kind, &anchor_data, anchor_start_line, anchor_end_line)
        .map_err(|e| {
            rusqlite::Error::FromSqlConversionFailure(8, rusqlite::types::Type::Text, Box::new(e))
        })?;

    let state_raw: String = row.get(6)?;
    let state = CommentState::from_str(&state_raw).ok_or_else(|| {
        rusqlite::Error::FromSqlConversionFailure(
            6,
            rusqlite::types::Type::Text,
            Box::new(BadEnum(state_raw.clone())),
        )
    })?;

    let pr_number: i64 = row.get(1)?;
    let github_id: Option<i64> = row.get(13)?;

    Ok(ReviewComment {
        id: row.get(0)?,
        pr_number: u64::try_from(pr_number).unwrap_or_default(),
        file_path: row.get(2)?,
        head_sha: row.get(3)?,
        body: row.get(4)?,
        author: row.get(5)?,
        state,
        anchor,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
        github_id,
        submit_error: row.get(14)?,
    })
}

#[derive(Debug)]
struct BadEnum(String);

impl std::fmt::Display for BadEnum {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "unknown enum value: {}", self.0)
    }
}

impl std::error::Error for BadEnum {}

#[derive(serde::Serialize, serde::Deserialize)]
struct AnchorPayload {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    line: Option<u32>,
    #[serde(default, rename = "startLine", skip_serializing_if = "Option::is_none")]
    start_line: Option<u32>,
    #[serde(default, rename = "endLine", skip_serializing_if = "Option::is_none")]
    end_line: Option<u32>,
    #[serde(default, rename = "codeStartLine", skip_serializing_if = "Option::is_none")]
    code_start_line: Option<u32>,
}

fn encode_anchor(anchor: &CommentAnchor) -> (String, String, i64, i64) {
    let (kind, payload, start, end): (&str, AnchorPayload, u32, u32) = match anchor {
        CommentAnchor::SingleLine { line } => (
            "singleLine",
            AnchorPayload {
                line: Some(*line),
                start_line: None,
                end_line: None,
                code_start_line: None,
            },
            *line,
            *line,
        ),
        CommentAnchor::LineRange {
            start_line,
            end_line,
        } => (
            "lineRange",
            AnchorPayload {
                line: None,
                start_line: Some(*start_line),
                end_line: Some(*end_line),
                code_start_line: None,
            },
            *start_line,
            *end_line,
        ),
        CommentAnchor::CodeBlock {
            start_line,
            end_line,
            code_start_line,
        } => (
            "codeBlock",
            AnchorPayload {
                line: None,
                start_line: Some(*start_line),
                end_line: Some(*end_line),
                code_start_line: Some(*code_start_line),
            },
            *start_line,
            *end_line,
        ),
    };
    (
        kind.to_string(),
        serde_json::to_string(&payload).unwrap_or_default(),
        i64::from(start),
        i64::from(end),
    )
}

fn decode_anchor(
    kind: &str,
    data: &str,
    start_line: i64,
    end_line: i64,
) -> Result<CommentAnchor, BadEnum> {
    let payload: AnchorPayload = serde_json::from_str(data).unwrap_or(AnchorPayload {
        line: None,
        start_line: None,
        end_line: None,
        code_start_line: None,
    });
    let start = payload
        .start_line
        .or(payload.line)
        .unwrap_or_else(|| u32::try_from(start_line).unwrap_or(1));
    let end = payload
        .end_line
        .or(payload.line)
        .unwrap_or_else(|| u32::try_from(end_line).unwrap_or(start));
    match kind {
        "singleLine" => Ok(CommentAnchor::SingleLine {
            line: payload.line.unwrap_or(start),
        }),
        "lineRange" => Ok(CommentAnchor::LineRange {
            start_line: start,
            end_line: end,
        }),
        "codeBlock" => Ok(CommentAnchor::CodeBlock {
            start_line: start,
            end_line: end,
            code_start_line: payload.code_start_line.unwrap_or(start),
        }),
        other => Err(BadEnum(other.to_string())),
    }
}

fn fetch_one(conn: &Connection, id: i64) -> AppResult<ReviewComment> {
    let sql = format!("SELECT {SELECT_COLS} FROM local_comments WHERE id = ?1");
    conn.query_row(&sql, params![id], row_to_comment)
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => AppError::db(format!("comment {id} not found")),
            other => AppError::db(other),
        })
}

#[async_trait]
impl CommentsStore for SqliteCommentsStore {
    async fn list_for_pr(&self, pr_number: u64) -> AppResult<Vec<ReviewComment>> {
        let db = self.db.clone();
        let pr_signed = i64::try_from(pr_number).unwrap_or(i64::MAX);
        tokio::task::spawn_blocking(move || {
            let conn = db.lock().map_err(|e| AppError::db(e.to_string()))?;
            let sql = format!(
                "SELECT {SELECT_COLS} FROM local_comments \
                 WHERE pr_number = ?1 \
                 ORDER BY file_path ASC, anchor_start_line ASC, id ASC"
            );
            let mut stmt = conn.prepare(&sql).map_err(AppError::db)?;
            let rows = stmt
                .query_map(params![pr_signed], row_to_comment)
                .map_err(AppError::db)?;
            let mut out = Vec::new();
            for r in rows {
                out.push(r.map_err(AppError::db)?);
            }
            Ok(out)
        })
        .await
        .map_err(AppError::unexpected)?
    }

    async fn list_for_file(
        &self,
        pr_number: u64,
        file_path: &str,
    ) -> AppResult<Vec<ReviewComment>> {
        let db = self.db.clone();
        let pr_signed = i64::try_from(pr_number).unwrap_or(i64::MAX);
        let path_owned = file_path.to_string();
        tokio::task::spawn_blocking(move || {
            let conn = db.lock().map_err(|e| AppError::db(e.to_string()))?;
            let sql = format!(
                "SELECT {SELECT_COLS} FROM local_comments \
                 WHERE pr_number = ?1 AND file_path = ?2 \
                 ORDER BY anchor_start_line ASC, id ASC"
            );
            let mut stmt = conn.prepare(&sql).map_err(AppError::db)?;
            let rows = stmt
                .query_map(params![pr_signed, path_owned], row_to_comment)
                .map_err(AppError::db)?;
            let mut out = Vec::new();
            for r in rows {
                out.push(r.map_err(AppError::db)?);
            }
            Ok(out)
        })
        .await
        .map_err(AppError::unexpected)?
    }

    async fn get(&self, id: i64) -> AppResult<Option<ReviewComment>> {
        let db = self.db.clone();
        tokio::task::spawn_blocking(move || {
            let conn = db.lock().map_err(|e| AppError::db(e.to_string()))?;
            let sql = format!("SELECT {SELECT_COLS} FROM local_comments WHERE id = ?1");
            match conn.query_row(&sql, params![id], row_to_comment) {
                Ok(c) => Ok(Some(c)),
                Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
                Err(e) => Err(AppError::db(e)),
            }
        })
        .await
        .map_err(AppError::unexpected)?
    }

    async fn create(&self, new: NewComment, now_unix_ms: i64) -> AppResult<ReviewComment> {
        let db = self.db.clone();
        tokio::task::spawn_blocking(move || {
            let (kind, data, start, end) = encode_anchor(&new.anchor);
            let pr_signed = i64::try_from(new.pr_number).unwrap_or(i64::MAX);
            let conn = db.lock().map_err(|e| AppError::db(e.to_string()))?;
            conn.execute(
                "INSERT INTO local_comments(pr_number, file_path, head_sha, body, author, state, \
                    anchor_kind, anchor_data, anchor_start_line, anchor_end_line, \
                    created_at, updated_at) \
                 VALUES (?1, ?2, ?3, ?4, ?5, 'draft', ?6, ?7, ?8, ?9, ?10, ?10)",
                params![
                    pr_signed,
                    new.file_path,
                    new.head_sha,
                    new.body,
                    new.author,
                    kind,
                    data,
                    start,
                    end,
                    now_unix_ms,
                ],
            )
            .map_err(AppError::db)?;
            let id = conn.last_insert_rowid();
            fetch_one(&conn, id)
        })
        .await
        .map_err(AppError::unexpected)?
    }

    async fn update(
        &self,
        id: i64,
        patch: CommentUpdate,
        now_unix_ms: i64,
    ) -> AppResult<ReviewComment> {
        let db = self.db.clone();
        tokio::task::spawn_blocking(move || {
            let conn = db.lock().map_err(|e| AppError::db(e.to_string()))?;
            let current = fetch_one(&conn, id)?;

            let new_state = patch.state.unwrap_or(current.state);
            if !current.state.can_transition_to(new_state) {
                return Err(AppError::db(format!(
                    "illegal state transition: {} -> {}",
                    current.state.as_str(),
                    new_state.as_str()
                )));
            }

            let new_anchor = patch.anchor.unwrap_or(current.anchor);
            let new_body = patch.body.unwrap_or(current.body);
            let (kind, data, start, end) = encode_anchor(&new_anchor);

            conn.execute(
                "UPDATE local_comments SET \
                    body = ?1, state = ?2, anchor_kind = ?3, anchor_data = ?4, \
                    anchor_start_line = ?5, anchor_end_line = ?6, updated_at = ?7 \
                 WHERE id = ?8",
                params![
                    new_body,
                    new_state.as_str(),
                    kind,
                    data,
                    start,
                    end,
                    now_unix_ms,
                    id
                ],
            )
            .map_err(AppError::db)?;

            fetch_one(&conn, id)
        })
        .await
        .map_err(AppError::unexpected)?
    }

    async fn delete(&self, id: i64, now_unix_ms: i64) -> AppResult<()> {
        let db = self.db.clone();
        tokio::task::spawn_blocking(move || {
            let conn = db.lock().map_err(|e| AppError::db(e.to_string()))?;
            conn.execute(
                "UPDATE local_comments SET state = 'deleted', updated_at = ?1 WHERE id = ?2",
                params![now_unix_ms, id],
            )
            .map_err(AppError::db)?;
            Ok(())
        })
        .await
        .map_err(AppError::unexpected)?
    }

    async fn record_submit(
        &self,
        id: i64,
        outcome: SubmitOutcome,
        now_unix_ms: i64,
    ) -> AppResult<ReviewComment> {
        let db = self.db.clone();
        tokio::task::spawn_blocking(move || {
            let conn = db.lock().map_err(|e| AppError::db(e.to_string()))?;
            let next_state = if outcome.github_id.is_some() {
                CommentState::Submitted
            } else {
                CommentState::Draft
            };
            conn.execute(
                "UPDATE local_comments SET \
                    github_id = COALESCE(?1, github_id), \
                    submit_error = ?2, \
                    state = ?3, \
                    updated_at = ?4 \
                 WHERE id = ?5",
                params![
                    outcome.github_id,
                    outcome.submit_error,
                    next_state.as_str(),
                    now_unix_ms,
                    id
                ],
            )
            .map_err(AppError::db)?;
            fetch_one(&conn, id)
        })
        .await
        .map_err(AppError::unexpected)?
    }
}

use std::path::Path;
use std::sync::{Arc, Mutex};

use markdown_reviewer_core::{AppError, AppResult};
use rusqlite::Connection;

/// Shared handle to the `SQLite` connection. Wrapped in a `Mutex` because
/// `rusqlite::Connection` is `!Sync`. All queries are short-lived so
/// serializing is fine for Phase 1.
pub type Db = Arc<Mutex<Connection>>;

const MIGRATIONS: &[(&str, &str)] = &[
    ("0001_recents", include_str!("migrations/0001_recents.sql")),
    (
        "0002_ui_state",
        include_str!("migrations/0002_ui_state.sql"),
    ),
    (
        "0003_local_comments",
        include_str!("migrations/0003_local_comments.sql"),
    ),
];

pub fn open_and_migrate(path: &Path) -> AppResult<Db> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(AppError::io)?;
    }
    let conn = Connection::open(path).map_err(AppError::db)?;
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(AppError::db)?;
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(AppError::db)?;
    run_migrations(&conn)?;
    Ok(Arc::new(Mutex::new(conn)))
}

fn run_migrations(conn: &Connection) -> AppResult<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
            name TEXT PRIMARY KEY,
            applied_at INTEGER NOT NULL
        )",
        [],
    )
    .map_err(AppError::db)?;

    for (name, sql) in MIGRATIONS {
        let already: bool = conn
            .query_row(
                "SELECT 1 FROM schema_migrations WHERE name = ?1",
                [name],
                |_| Ok(true),
            )
            .optional_or(false)?;
        if already {
            continue;
        }
        conn.execute_batch(sql).map_err(AppError::db)?;
        conn.execute(
            "INSERT INTO schema_migrations(name, applied_at) VALUES (?1, strftime('%s', 'now') * 1000)",
            [name],
        )
        .map_err(AppError::db)?;
        tracing::info!(migration = name, "applied migration");
    }
    Ok(())
}

// Small helper since rusqlite doesn't expose `optional_or` on query_row.
trait OptionalOr<T> {
    fn optional_or(self, default: T) -> AppResult<T>;
}

impl<T> OptionalOr<T> for rusqlite::Result<T> {
    fn optional_or(self, default: T) -> AppResult<T> {
        match self {
            Ok(v) => Ok(v),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(default),
            Err(e) => Err(AppError::db(e)),
        }
    }
}

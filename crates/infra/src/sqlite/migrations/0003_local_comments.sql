CREATE TABLE IF NOT EXISTS local_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pr_number INTEGER NOT NULL,
    file_path TEXT NOT NULL,
    head_sha TEXT NOT NULL,
    body TEXT NOT NULL,
    author TEXT,
    state TEXT NOT NULL,
    anchor_kind TEXT NOT NULL,
    anchor_data TEXT NOT NULL,
    anchor_start_line INTEGER NOT NULL,
    anchor_end_line INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    github_id INTEGER,
    submit_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_local_comments_pr
    ON local_comments(pr_number);

CREATE INDEX IF NOT EXISTS idx_local_comments_pr_file
    ON local_comments(pr_number, file_path, anchor_start_line);

CREATE UNIQUE INDEX IF NOT EXISTS idx_local_comments_github_id
    ON local_comments(github_id) WHERE github_id IS NOT NULL;

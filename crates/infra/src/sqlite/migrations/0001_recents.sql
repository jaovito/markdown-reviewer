CREATE TABLE IF NOT EXISTS recent_repositories (
    path TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    remote_url TEXT,
    owner TEXT,
    repo TEXT,
    last_opened_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_recent_repos_last_opened
    ON recent_repositories(last_opened_at DESC);

CREATE TABLE IF NOT EXISTS remote_threads_cache (
    repo_path TEXT NOT NULL,
    pr_number INTEGER NOT NULL,
    head_sha TEXT NOT NULL,
    refreshed_at_ms INTEGER NOT NULL,
    payload_json TEXT NOT NULL,
    PRIMARY KEY (repo_path, pr_number)
);

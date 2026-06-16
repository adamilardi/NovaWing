ALTER TABLE leaderboard_runs
ADD COLUMN completed_at TEXT;

ALTER TABLE leaderboard_runs
ADD COLUMN client_key TEXT;

CREATE INDEX IF NOT EXISTS leaderboard_runs_client_key_idx
ON leaderboard_runs (client_key, created_at);

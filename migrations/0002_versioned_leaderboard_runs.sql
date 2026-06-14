ALTER TABLE leaderboard_entries
ADD COLUMN game_version TEXT NOT NULL DEFAULT '1.0.0';

DROP INDEX IF EXISTS leaderboard_rank_idx;

CREATE INDEX IF NOT EXISTS leaderboard_rank_idx
ON leaderboard_entries (game_version, time_ms ASC, score DESC, kills DESC, created_at ASC);

CREATE TABLE IF NOT EXISTS leaderboard_runs (
    id TEXT PRIMARY KEY,
    game_version TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT
);

CREATE INDEX IF NOT EXISTS leaderboard_runs_expiry_idx
ON leaderboard_runs (expires_at, used_at);

CREATE TABLE IF NOT EXISTS leaderboard_entries (
    id TEXT PRIMARY KEY,
    game_version TEXT NOT NULL,
    name TEXT NOT NULL,
    time_ms INTEGER NOT NULL,
    score INTEGER NOT NULL,
    kills INTEGER NOT NULL,
    accuracy INTEGER NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS leaderboard_rank_idx
ON leaderboard_entries (game_version, time_ms ASC, score DESC, kills DESC, created_at ASC);

CREATE TABLE IF NOT EXISTS leaderboard_runs (
    id TEXT PRIMARY KEY,
    game_version TEXT NOT NULL,
    client_key TEXT,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    completed_at TEXT,
    used_at TEXT
);

CREATE INDEX IF NOT EXISTS leaderboard_runs_expiry_idx
ON leaderboard_runs (expires_at, used_at);

CREATE INDEX IF NOT EXISTS leaderboard_runs_client_key_idx
ON leaderboard_runs (client_key, created_at);

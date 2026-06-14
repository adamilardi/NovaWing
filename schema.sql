CREATE TABLE IF NOT EXISTS leaderboard_entries (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    time_ms INTEGER NOT NULL,
    score INTEGER NOT NULL,
    kills INTEGER NOT NULL,
    accuracy INTEGER NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS leaderboard_rank_idx
ON leaderboard_entries (time_ms ASC, score DESC, kills DESC, created_at ASC);

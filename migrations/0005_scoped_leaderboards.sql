-- Preserve existing rankings as campaign results while adding independent
-- Level 1, Level 2, and Level 3 boards.
ALTER TABLE leaderboard_entries
ADD COLUMN scope TEXT NOT NULL DEFAULT 'campaign';

ALTER TABLE leaderboard_runs
ADD COLUMN scope TEXT NOT NULL DEFAULT 'campaign';

DROP INDEX IF EXISTS leaderboard_rank_idx;

CREATE INDEX leaderboard_rank_idx
ON leaderboard_entries (
    game_version,
    scope,
    time_ms ASC,
    score DESC,
    kills DESC,
    created_at ASC
);

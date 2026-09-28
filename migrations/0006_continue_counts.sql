-- Existing results used no continues under the previous eligibility rules.
ALTER TABLE leaderboard_runs ADD COLUMN continues INTEGER NOT NULL DEFAULT 0;
ALTER TABLE leaderboard_entries ADD COLUMN continues INTEGER NOT NULL DEFAULT 0;

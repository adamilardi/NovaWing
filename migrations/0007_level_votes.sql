-- One row per pilot name per extra bonus level. A later vote replaces the earlier one.
CREATE TABLE IF NOT EXISTS level_votes (
    level_id INTEGER NOT NULL,
    name_key TEXT NOT NULL,
    name TEXT NOT NULL,
    vote TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (level_id, name_key)
);

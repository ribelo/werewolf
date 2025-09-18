CREATE TABLE plate_sets (
    id TEXT PRIMARY KEY,
    contest_id TEXT NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
    plate_weight REAL NOT NULL,
    quantity INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(contest_id, plate_weight)
);

ALTER TABLE contests ADD COLUMN bar_weight REAL DEFAULT 20.0;

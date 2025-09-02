-- Add plate sets table for managing available plates per competition
CREATE TABLE plate_sets (
    id TEXT PRIMARY KEY,
    contest_id TEXT NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
    plate_weight REAL NOT NULL,  -- Weight of single plate in kg
    quantity INTEGER NOT NULL,    -- Number of pairs available
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(contest_id, plate_weight)
);

-- Add bar weight to contest settings (default 20kg for men's competitions)
ALTER TABLE contests ADD COLUMN bar_weight REAL DEFAULT 20.0;
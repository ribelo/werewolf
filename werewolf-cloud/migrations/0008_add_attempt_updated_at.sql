ALTER TABLE attempts ADD COLUMN updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill for existing rows (SQLite automatically uses default, but keep for safety)
UPDATE attempts SET updated_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP);

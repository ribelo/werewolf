-- Remove the obsolete sort_order column from contest tags and rely on creation time for ordering.

PRAGMA foreign_keys = OFF;

CREATE TABLE contest_tags_new (
    id TEXT PRIMARY KEY,
    contest_id TEXT NOT NULL,
    label TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (contest_id) REFERENCES contests(id) ON DELETE CASCADE
);

INSERT INTO contest_tags_new (id, contest_id, label, created_at, updated_at)
SELECT
    id,
    contest_id,
    label,
    CASE
        WHEN created_at LIKE '%T%' THEN created_at
        ELSE substr(created_at, 1, 10) || 'T' || substr(created_at, 12) || 'Z'
    END AS created_at_iso,
    CASE
        WHEN updated_at LIKE '%T%' THEN updated_at
        ELSE substr(updated_at, 1, 10) || 'T' || substr(updated_at, 12) || 'Z'
    END AS updated_at_iso
FROM contest_tags;

DROP TABLE contest_tags;
ALTER TABLE contest_tags_new RENAME TO contest_tags;

CREATE UNIQUE INDEX contest_tags_contest_label_idx
    ON contest_tags (contest_id, label);

PRAGMA foreign_keys = ON;

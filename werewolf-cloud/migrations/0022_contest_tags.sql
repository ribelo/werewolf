-- Contest tag presets ensure every contest has configurable labels (including mandatory "Open").

PRAGMA foreign_keys = ON;

CREATE TABLE contest_tags (
    id TEXT PRIMARY KEY,
    contest_id TEXT NOT NULL,
    label TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (contest_id) REFERENCES contests(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX contest_tags_contest_label_idx
    ON contest_tags (contest_id, label);

-- Seed existing contests with the mandatory "Open" tag.
INSERT INTO contest_tags (id, contest_id, label, sort_order)
SELECT
    lower(
        hex(randomblob(4)) || '-' ||
        hex(randomblob(2)) || '-' ||
        hex(randomblob(2)) || '-' ||
        hex(randomblob(2)) || '-' ||
        hex(randomblob(6))
    ),
    contests.id,
    'Open',
    0
FROM contests
WHERE NOT EXISTS (
    SELECT 1
    FROM contest_tags existing
    WHERE existing.contest_id = contests.id
      AND existing.label = 'Open'
);

-- Ensure registrations include "Open" when no tags are present and avoid duplicating it otherwise.
UPDATE registrations
SET labels = CASE
    WHEN labels IS NULL OR TRIM(labels) = '' THEN '["Open"]'
    WHEN json_valid(labels) = 0 THEN '["Open"]'
    WHEN EXISTS (
        SELECT 1
        FROM json_each(labels)
        WHERE value = 'Open'
    ) THEN labels
    ELSE (
        SELECT json_group_array(value)
        FROM (
            SELECT value FROM json_each(labels)
            UNION ALL
            SELECT 'Open'
        )
    )
END;

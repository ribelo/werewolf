-- Normalize attempt statuses and restrict to Pending/Successful/Failed

PRAGMA foreign_keys = OFF;

UPDATE attempts
SET status = CASE LOWER(status)
  WHEN 'successful' THEN 'Successful'
  WHEN 'good' THEN 'Successful'
  WHEN 'failed' THEN 'Failed'
  WHEN 'bad' THEN 'Failed'
  WHEN 'skipped' THEN 'Failed'
  WHEN 'current' THEN 'Pending'
  WHEN 'none' THEN 'Pending'
  WHEN 'pending' THEN 'Pending'
  ELSE 'Pending'
END;

CREATE TABLE attempts_new (
    id TEXT PRIMARY KEY,
    registration_id TEXT NOT NULL,
    lift_type TEXT NOT NULL CHECK(lift_type IN ('Bench','Squat','Deadlift')),
    attempt_number INTEGER NOT NULL CHECK(attempt_number IN (1,2,3,4)),
    weight REAL NOT NULL CHECK(weight >= 0),
    status TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending','Successful','Failed')),
    timestamp TEXT,
    judge1_decision BOOLEAN,
    judge2_decision BOOLEAN,
    judge3_decision BOOLEAN,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (registration_id) REFERENCES registrations(id) ON DELETE CASCADE,
    UNIQUE(registration_id, lift_type, attempt_number)
);

INSERT INTO attempts_new (
    id, registration_id, lift_type, attempt_number, weight, status,
    timestamp, judge1_decision, judge2_decision, judge3_decision,
    notes, created_at, updated_at
)
SELECT
    id, registration_id, lift_type, attempt_number, weight, status,
    timestamp, judge1_decision, judge2_decision, judge3_decision,
    notes, created_at, updated_at
FROM attempts;

DROP TABLE attempts;
ALTER TABLE attempts_new RENAME TO attempts;

PRAGMA foreign_keys = ON;

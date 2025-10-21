-- Create table for per-registration lift selections
CREATE TABLE IF NOT EXISTS registration_lifts (
    registration_id TEXT NOT NULL,
    lift_type TEXT NOT NULL CHECK (lift_type IN ('Squat','Bench','Deadlift')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (registration_id, lift_type),
    FOREIGN KEY (registration_id) REFERENCES registrations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_registration_lifts_registration
    ON registration_lifts (registration_id);

-- Populate default lift selections for existing registrations.
-- When competition_type names explicit lifts, prefer that exact subset.
-- Otherwise fall back to contest discipline, defaulting to all three when unspecified.
INSERT OR IGNORE INTO registration_lifts (registration_id, lift_type)
SELECT r.id, 'Squat'
FROM registrations r
JOIN contests c ON r.contest_id = c.id
WHERE (
    CASE
        WHEN length(trim(COALESCE(c.competition_type, ''))) > 0
             AND (
                 instr(lower(COALESCE(c.competition_type, '')), 'squat') > 0
                 OR instr(lower(COALESCE(c.competition_type, '')), 'bench') > 0
                 OR instr(lower(COALESCE(c.competition_type, '')), 'deadlift') > 0
             )
            THEN CASE
                WHEN instr(lower(COALESCE(c.competition_type, '')), 'squat') > 0 THEN 1
                ELSE 0
            END
        ELSE CASE
            WHEN lower(COALESCE(c.discipline, '')) IN ('squat', 'powerlifting') THEN 1
            WHEN trim(COALESCE(c.discipline, '')) = '' THEN 1
            ELSE 0
        END
    END
) = 1;

INSERT OR IGNORE INTO registration_lifts (registration_id, lift_type)
SELECT r.id, 'Bench'
FROM registrations r
JOIN contests c ON r.contest_id = c.id
WHERE (
    CASE
        WHEN length(trim(COALESCE(c.competition_type, ''))) > 0
             AND (
                 instr(lower(COALESCE(c.competition_type, '')), 'squat') > 0
                 OR instr(lower(COALESCE(c.competition_type, '')), 'bench') > 0
                 OR instr(lower(COALESCE(c.competition_type, '')), 'deadlift') > 0
             )
            THEN CASE
                WHEN instr(lower(COALESCE(c.competition_type, '')), 'bench') > 0 THEN 1
                ELSE 0
            END
        ELSE CASE
            WHEN lower(COALESCE(c.discipline, '')) IN ('bench', 'powerlifting') THEN 1
            WHEN trim(COALESCE(c.discipline, '')) = '' THEN 1
            ELSE 0
        END
    END
) = 1;

INSERT OR IGNORE INTO registration_lifts (registration_id, lift_type)
SELECT r.id, 'Deadlift'
FROM registrations r
JOIN contests c ON r.contest_id = c.id
WHERE (
    CASE
        WHEN length(trim(COALESCE(c.competition_type, ''))) > 0
             AND (
                 instr(lower(COALESCE(c.competition_type, '')), 'squat') > 0
                 OR instr(lower(COALESCE(c.competition_type, '')), 'bench') > 0
                 OR instr(lower(COALESCE(c.competition_type, '')), 'deadlift') > 0
             )
            THEN CASE
                WHEN instr(lower(COALESCE(c.competition_type, '')), 'deadlift') > 0 THEN 1
                ELSE 0
            END
        ELSE CASE
            WHEN lower(COALESCE(c.discipline, '')) IN ('deadlift', 'powerlifting') THEN 1
            WHEN trim(COALESCE(c.discipline, '')) = '' THEN 1
            ELSE 0
        END
    END
) = 1;

-- Rename legacy OPEN age category codes to the new SENIOR convention.
-- Skip contests that already define a SENIOR code to avoid violating unique constraints.

WITH targets AS (
  SELECT id
  FROM contest_age_categories current
  WHERE UPPER(current.code) = 'OPEN'
    AND NOT EXISTS (
      SELECT 1
      FROM contest_age_categories existing
      WHERE existing.contest_id = current.contest_id
        AND existing.id != current.id
        AND UPPER(existing.code) = 'SENIOR'
    )
)
UPDATE contest_age_categories
SET code = 'SENIOR'
WHERE id IN (SELECT id FROM targets);

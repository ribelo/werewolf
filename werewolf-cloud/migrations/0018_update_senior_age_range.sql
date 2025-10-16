-- Normalize the Senior (OPEN) age category to cover 24-39 across all contests

UPDATE contest_age_categories
SET
  min_age = 24,
  max_age = 39,
  name = CASE
    WHEN name IN ('Open', 'Senior', 'Senior (24-39)', 'Senior (24 - 39)', 'Senior(24-39)') THEN 'Senior (24-39)'
    ELSE name
  END
WHERE UPPER(code) = 'OPEN';


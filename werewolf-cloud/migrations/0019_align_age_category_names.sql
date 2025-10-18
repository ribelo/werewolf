-- Align legacy contest age category names with the current domain templates.

UPDATE contest_age_categories
SET name = 'T16 (≤16)'
WHERE UPPER(code) = 'T16'
  AND name IS DISTINCT FROM 'T16 (≤16)';

UPDATE contest_age_categories
SET name = 'T19 (16-19)'
WHERE UPPER(code) = 'T19'
  AND name IS DISTINCT FROM 'T19 (16-19)';

UPDATE contest_age_categories
SET name = 'Junior (20-23)'
WHERE UPPER(code) = 'JUNIOR'
  AND name IS DISTINCT FROM 'Junior (20-23)';

UPDATE contest_age_categories
SET name = 'Senior (24-39)'
WHERE UPPER(code) IN ('OPEN', 'SENIOR')
  AND name IS DISTINCT FROM 'Senior (24-39)';

UPDATE contest_age_categories
SET name = 'Master 40-49'
WHERE UPPER(code) = 'M40'
  AND name IS DISTINCT FROM 'Master 40-49';

UPDATE contest_age_categories
SET name = 'Master 50-59'
WHERE UPPER(code) = 'M50'
  AND name IS DISTINCT FROM 'Master 50-59';

UPDATE contest_age_categories
SET name = 'Master 60+'
WHERE UPPER(code) = 'M60'
  AND name IS DISTINCT FROM 'Master 60+';

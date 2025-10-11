-- Remove legacy non-age categories seeded as age categories
DELETE FROM contest_age_categories
WHERE code IN ('SAMORZAD', 'GORNIK', 'MONSTER');

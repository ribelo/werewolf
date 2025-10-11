-- Add clamp weight column to contests (kilograms, covers both collars)
ALTER TABLE contests ADD COLUMN clamp_weight REAL DEFAULT 2.5;

-- Back-fill existing records with default 2.5 kg if null
UPDATE contests SET clamp_weight = 2.5 WHERE clamp_weight IS NULL;

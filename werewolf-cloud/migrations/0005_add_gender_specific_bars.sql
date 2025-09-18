ALTER TABLE contests ADD COLUMN mens_bar_weight REAL DEFAULT 20.0;
ALTER TABLE contests ADD COLUMN womens_bar_weight REAL DEFAULT 15.0;

UPDATE contests
SET mens_bar_weight = COALESCE(bar_weight, 20.0)
WHERE mens_bar_weight IS NULL;

UPDATE contests
SET womens_bar_weight = CASE
    WHEN discipline = 'Bench' THEN 20.0
    ELSE 15.0
END
WHERE womens_bar_weight IS NULL;

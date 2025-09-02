-- Add gender-specific bar weights to support separate men's and women's bars
-- Men typically use 20kg bars, women typically use 15kg bars

-- Add separate columns for men's and women's bar weights
ALTER TABLE contests ADD COLUMN mens_bar_weight REAL DEFAULT 20.0;
ALTER TABLE contests ADD COLUMN womens_bar_weight REAL DEFAULT 15.0;

-- Migrate existing bar_weight data to mens_bar_weight
-- This preserves existing contest configurations
UPDATE contests 
SET mens_bar_weight = COALESCE(bar_weight, 20.0)
WHERE mens_bar_weight IS NULL;

-- Set womens_bar_weight based on discipline or default to 15kg
-- For bench press competitions, women might also use 20kg bars in some federations
UPDATE contests 
SET womens_bar_weight = CASE 
    WHEN discipline = 'Bench' THEN 20.0  -- Bench press often uses same bar weight
    ELSE 15.0                            -- Squat/Deadlift/Powerlifting typically use lighter bar for women
END
WHERE womens_bar_weight IS NULL;

-- Note: We keep the old bar_weight column for backward compatibility
-- It can be removed in a future migration once all code is updated
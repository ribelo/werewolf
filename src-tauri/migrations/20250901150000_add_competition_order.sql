-- Add competition order to competitors table
-- For managing the order in which competitors approach the competition

-- Add the competition_order column with default values
ALTER TABLE competitors ADD COLUMN competition_order INTEGER NOT NULL DEFAULT 0;

-- Set initial values for existing competitors (if any)
-- This will assign incremental order starting from 1
UPDATE competitors SET competition_order = (
    SELECT COUNT(*) + 1 
    FROM competitors c2 
    WHERE c2.id < competitors.id
) WHERE competition_order = 0;

-- Add unique constraint to prevent duplicate orders
CREATE UNIQUE INDEX idx_competitors_competition_order_unique ON competitors(competition_order);

-- Add performance index
CREATE INDEX idx_competitors_competition_order ON competitors(competition_order);
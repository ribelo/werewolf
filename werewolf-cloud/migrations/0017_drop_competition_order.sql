-- Drop competition_order column and related indexes from competitors
DROP INDEX IF EXISTS idx_competitors_competition_order_unique;
DROP INDEX IF EXISTS idx_competitors_competition_order;

-- SQLite in D1 supports DROP COLUMN; if not, this will be adapted in a follow-up.
ALTER TABLE competitors DROP COLUMN competition_order;

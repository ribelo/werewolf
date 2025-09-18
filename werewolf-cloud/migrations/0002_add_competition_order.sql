ALTER TABLE competitors ADD COLUMN competition_order INTEGER NOT NULL DEFAULT 0;

UPDATE competitors
SET competition_order = (
    SELECT COUNT(*) + 1
    FROM competitors c2
    WHERE c2.id < competitors.id
)
WHERE competition_order = 0;

CREATE UNIQUE INDEX idx_competitors_competition_order_unique ON competitors(competition_order);
CREATE INDEX idx_competitors_competition_order ON competitors(competition_order);

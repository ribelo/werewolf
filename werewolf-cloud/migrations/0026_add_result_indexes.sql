-- Additive indexes to speed up rankings reads and writes
-- Safe for existing data and production environments

PRAGMA foreign_keys = ON;

-- Results by contest and open placement (scoreboard/export)
CREATE INDEX IF NOT EXISTS idx_results_contest_place_open
  ON results (contest_id, place_open);

-- Results by contest and age/weight placements
CREATE INDEX IF NOT EXISTS idx_results_contest_place_age
  ON results (contest_id, place_in_age_class);

CREATE INDEX IF NOT EXISTS idx_results_contest_place_weight
  ON results (contest_id, place_in_weight_class);

-- Generic helpers for frequent joins/filters
CREATE INDEX IF NOT EXISTS idx_results_contest
  ON results (contest_id);

CREATE INDEX IF NOT EXISTS idx_registrations_contest
  ON registrations (contest_id);


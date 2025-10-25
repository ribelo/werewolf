-- Allow registrations to omit bodyweight and weight class until weigh-in
PRAGMA foreign_keys = OFF;

CREATE TABLE registrations_new (
  id TEXT PRIMARY KEY,
  contest_id TEXT NOT NULL,
  competitor_id TEXT NOT NULL,
  age_category_id TEXT NOT NULL,
  weight_class_id TEXT,
  bodyweight REAL,
  reshel_coefficient REAL,
  mccullough_coefficient REAL,
  rack_height_squat INTEGER,
  rack_height_bench INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  flight_code TEXT,
  flight_order INTEGER,
  labels TEXT DEFAULT '[]',
  FOREIGN KEY (contest_id) REFERENCES contests(id) ON DELETE CASCADE,
  FOREIGN KEY (competitor_id) REFERENCES competitors(id) ON DELETE CASCADE,
  FOREIGN KEY (age_category_id) REFERENCES contest_age_categories(id) ON DELETE RESTRICT,
  FOREIGN KEY (weight_class_id) REFERENCES contest_weight_classes(id) ON DELETE RESTRICT,
  UNIQUE (contest_id, competitor_id)
);

INSERT INTO registrations_new (
  id,
  contest_id,
  competitor_id,
  age_category_id,
  weight_class_id,
  bodyweight,
  reshel_coefficient,
  mccullough_coefficient,
  rack_height_squat,
  rack_height_bench,
  created_at,
  flight_code,
  flight_order,
  labels
)
SELECT
  id,
  contest_id,
  competitor_id,
  age_category_id,
  weight_class_id,
  bodyweight,
  reshel_coefficient,
  mccullough_coefficient,
  rack_height_squat,
  rack_height_bench,
  created_at,
  flight_code,
  flight_order,
  COALESCE(labels, '[]')
FROM registrations;

DROP TABLE registrations;
ALTER TABLE registrations_new RENAME TO registrations;

PRAGMA foreign_keys = ON;

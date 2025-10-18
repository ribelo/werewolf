-- Contest-scoped age and weight categories

PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS results;
DROP TABLE IF EXISTS attempts;
DROP TABLE IF EXISTS current_lifts;
DROP TABLE IF EXISTS registrations;
DROP TABLE IF EXISTS age_categories;
DROP TABLE IF EXISTS weight_classes;
DROP TABLE IF EXISTS contest_age_categories;
DROP TABLE IF EXISTS contest_weight_classes;

CREATE TABLE contest_age_categories (
    id TEXT PRIMARY KEY,
    contest_id TEXT NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    min_age INTEGER,
    max_age INTEGER,
    sort_order INTEGER NOT NULL DEFAULT 0,
    metadata TEXT,
    FOREIGN KEY (contest_id) REFERENCES contests(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX contest_age_categories_contest_code_idx
    ON contest_age_categories (contest_id, code);

CREATE TABLE contest_weight_classes (
    id TEXT PRIMARY KEY,
    contest_id TEXT NOT NULL,
    gender TEXT NOT NULL CHECK (gender IN ('Male','Female')),
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    min_weight REAL,
    max_weight REAL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    metadata TEXT,
    FOREIGN KEY (contest_id) REFERENCES contests(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX contest_weight_classes_contest_code_idx
    ON contest_weight_classes (contest_id, gender, code);

CREATE TABLE registrations (
    id TEXT PRIMARY KEY,
    contest_id TEXT NOT NULL,
    competitor_id TEXT NOT NULL,
    age_category_id TEXT NOT NULL,
    weight_class_id TEXT NOT NULL,
    equipment_m BOOLEAN NOT NULL DEFAULT FALSE,
    equipment_sm BOOLEAN NOT NULL DEFAULT FALSE,
    equipment_t BOOLEAN NOT NULL DEFAULT FALSE,
    bodyweight REAL NOT NULL,
    lot_number TEXT,
    personal_record_at_entry REAL,
    reshel_coefficient REAL,
    mccullough_coefficient REAL,
    rack_height_squat INTEGER,
    rack_height_bench INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (contest_id) REFERENCES contests(id) ON DELETE CASCADE,
    FOREIGN KEY (competitor_id) REFERENCES competitors(id) ON DELETE CASCADE,
    FOREIGN KEY (age_category_id) REFERENCES contest_age_categories(id) ON DELETE RESTRICT,
    FOREIGN KEY (weight_class_id) REFERENCES contest_weight_classes(id) ON DELETE RESTRICT,
    UNIQUE(contest_id, competitor_id)
);

CREATE TABLE attempts (
    id TEXT PRIMARY KEY,
    registration_id TEXT NOT NULL,
    lift_type TEXT NOT NULL CHECK(lift_type IN ('Bench','Squat','Deadlift')),
    attempt_number INTEGER NOT NULL CHECK(attempt_number IN (1,2,3,4)),
    weight REAL NOT NULL CHECK(weight >= 0),
    status TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending','Successful','Failed','Skipped')),
    timestamp TEXT,
    judge1_decision BOOLEAN,
    judge2_decision BOOLEAN,
    judge3_decision BOOLEAN,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (registration_id) REFERENCES registrations(id) ON DELETE CASCADE,
    UNIQUE(registration_id, lift_type, attempt_number)
);

CREATE TABLE results (
    id TEXT PRIMARY KEY,
    registration_id TEXT NOT NULL,
    contest_id TEXT NOT NULL,
    best_bench REAL DEFAULT 0,
    best_squat REAL DEFAULT 0,
    best_deadlift REAL DEFAULT 0,
    total_weight REAL NOT NULL DEFAULT 0,
    coefficient_points REAL NOT NULL DEFAULT 0,
    place_open INTEGER,
    place_in_age_class INTEGER,
    place_in_weight_class INTEGER,
    is_disqualified BOOLEAN NOT NULL DEFAULT FALSE,
    disqualification_reason TEXT,
    broke_record BOOLEAN NOT NULL DEFAULT FALSE,
    record_type TEXT,
    calculated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (registration_id) REFERENCES registrations(id) ON DELETE CASCADE,
    FOREIGN KEY (contest_id) REFERENCES contests(id) ON DELETE CASCADE
);

CREATE TABLE current_lifts (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    contest_id TEXT NOT NULL,
    registration_id TEXT NOT NULL,
    lift_type TEXT NOT NULL CHECK(lift_type IN ('Bench','Squat','Deadlift')),
    attempt_number INTEGER NOT NULL CHECK(attempt_number IN (1,2,3,4)),
    weight REAL NOT NULL,
    timer_start TEXT,
    timer_duration INTEGER NOT NULL DEFAULT 60,
    rack_height INTEGER,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (contest_id) REFERENCES contests(id) ON DELETE CASCADE,
    FOREIGN KEY (registration_id) REFERENCES registrations(id) ON DELETE CASCADE
);

-- Seed contest categories for existing contests using default templates
INSERT INTO contest_age_categories (id, contest_id, code, name, min_age, max_age, sort_order)
SELECT contest.id || ':T16', contest.id, 'T16', 'T16 (≤16)', NULL, 16, 10 FROM contests contest;
INSERT INTO contest_age_categories (id, contest_id, code, name, min_age, max_age, sort_order)
SELECT contest.id || ':T19', contest.id, 'T19', 'T19 (16-19)', 16, 19, 20 FROM contests contest;
INSERT INTO contest_age_categories (id, contest_id, code, name, min_age, max_age, sort_order)
SELECT contest.id || ':JUNIOR', contest.id, 'JUNIOR', 'Junior (20-23)', 20, 23, 30 FROM contests contest;
INSERT INTO contest_age_categories (id, contest_id, code, name, min_age, max_age, sort_order)
SELECT contest.id || ':SENIOR', contest.id, 'SENIOR', 'Senior (24-39)', 24, 39, 40 FROM contests contest;
INSERT INTO contest_age_categories (id, contest_id, code, name, min_age, max_age, sort_order)
SELECT contest.id || ':SAMORZAD', contest.id, 'SAMORZAD', 'Kat. Samorządowiec', NULL, NULL, 45 FROM contests contest;
INSERT INTO contest_age_categories (id, contest_id, code, name, min_age, max_age, sort_order)
SELECT contest.id || ':GORNIK', contest.id, 'GORNIK', 'Kat. Górnik', NULL, NULL, 46 FROM contests contest;
INSERT INTO contest_age_categories (id, contest_id, code, name, min_age, max_age, sort_order)
SELECT contest.id || ':MONSTER', contest.id, 'MONSTER', 'Kat. Monster', NULL, NULL, 47 FROM contests contest;
INSERT INTO contest_age_categories (id, contest_id, code, name, min_age, max_age, sort_order)
SELECT contest.id || ':M40', contest.id, 'M40', 'Master 40-49', 40, 49, 50 FROM contests contest;
INSERT INTO contest_age_categories (id, contest_id, code, name, min_age, max_age, sort_order)
SELECT contest.id || ':M50', contest.id, 'M50', 'Master 50-59', 50, 59, 60 FROM contests contest;
INSERT INTO contest_age_categories (id, contest_id, code, name, min_age, max_age, sort_order)
SELECT contest.id || ':M60', contest.id, 'M60', 'Master 60+', 60, NULL, 70 FROM contests contest;

INSERT INTO contest_weight_classes (id, contest_id, gender, code, name, min_weight, max_weight, sort_order)
SELECT contest.id || ':F_52', contest.id, 'Female', 'F_52', 'Do 52 kg', NULL, 52.0, 10 FROM contests contest;
INSERT INTO contest_weight_classes (id, contest_id, gender, code, name, min_weight, max_weight, sort_order)
SELECT contest.id || ':F_60', contest.id, 'Female', 'F_60', 'Do 60 kg', 52.01, 60.0, 20 FROM contests contest;
INSERT INTO contest_weight_classes (id, contest_id, gender, code, name, min_weight, max_weight, sort_order)
SELECT contest.id || ':F_67_5', contest.id, 'Female', 'F_67_5', 'Do 67.5 kg', 60.01, 67.5, 30 FROM contests contest;
INSERT INTO contest_weight_classes (id, contest_id, gender, code, name, min_weight, max_weight, sort_order)
SELECT contest.id || ':F_82_5', contest.id, 'Female', 'F_82_5', 'Do 82.5 kg', 67.51, 82.5, 40 FROM contests contest;
INSERT INTO contest_weight_classes (id, contest_id, gender, code, name, min_weight, max_weight, sort_order)
SELECT contest.id || ':F_82_5_PLUS', contest.id, 'Female', 'F_82_5_PLUS', '82.5+ kg', 82.51, NULL, 50 FROM contests contest;
INSERT INTO contest_weight_classes (id, contest_id, gender, code, name, min_weight, max_weight, sort_order)
SELECT contest.id || ':M_67_5', contest.id, 'Male', 'M_67_5', 'Do 67.5 kg', NULL, 67.5, 10 FROM contests contest;
INSERT INTO contest_weight_classes (id, contest_id, gender, code, name, min_weight, max_weight, sort_order)
SELECT contest.id || ':M_82_5', contest.id, 'Male', 'M_82_5', 'Do 82.5 kg', 67.51, 82.5, 20 FROM contests contest;
INSERT INTO contest_weight_classes (id, contest_id, gender, code, name, min_weight, max_weight, sort_order)
SELECT contest.id || ':M_95', contest.id, 'Male', 'M_95', 'Do 95 kg', 82.51, 95.0, 30 FROM contests contest;
INSERT INTO contest_weight_classes (id, contest_id, gender, code, name, min_weight, max_weight, sort_order)
SELECT contest.id || ':M_110', contest.id, 'Male', 'M_110', 'Do 110 kg', 95.01, 110.0, 40 FROM contests contest;
INSERT INTO contest_weight_classes (id, contest_id, gender, code, name, min_weight, max_weight, sort_order)
SELECT contest.id || ':M_125', contest.id, 'Male', 'M_125', 'Do 125 kg', 110.01, 125.0, 50 FROM contests contest;
INSERT INTO contest_weight_classes (id, contest_id, gender, code, name, min_weight, max_weight, sort_order)
SELECT contest.id || ':M_125_PLUS', contest.id, 'Male', 'M_125_PLUS', '125+ kg', 125.01, NULL, 60 FROM contests contest;

PRAGMA foreign_keys = ON;

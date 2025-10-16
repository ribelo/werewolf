-- Initial schema for Werewolf powerlifting contest management migrated to Cloudflare D1.
-- Mirrors the legacy SQLite structure to support straight data migration.

PRAGMA foreign_keys = ON;

CREATE TABLE contests (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    date TEXT NOT NULL,
    location TEXT NOT NULL,
    discipline TEXT NOT NULL CHECK(discipline IN ('Bench','Squat','Deadlift','Powerlifting')),
    status TEXT NOT NULL DEFAULT 'Setup' CHECK(status IN ('Setup','InProgress','Paused','Completed')),
    federation_rules TEXT,
    competition_type TEXT,
    organizer TEXT,
    notes TEXT,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE age_categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    min_age INTEGER,
    max_age INTEGER
);

INSERT INTO age_categories (id, name, min_age, max_age) VALUES
('JUNIOR13', 'Junior 13', 13, 15),
('JUNIOR16', 'Junior 16', 16, 18),
('JUNIOR19', 'Junior 19', 19, 19),
('JUNIOR23', 'Junior 23', 20, 23),
('SENIOR', 'Senior (24-39)', 24, 39),
('VETERAN40', 'Veteran 40', 40, 49),
('VETERAN50', 'Veteran 50', 50, 59),
('VETERAN60', 'Veteran 60', 60, 69),
('VETERAN70', 'Veteran 70', 70, NULL);

CREATE TABLE weight_classes (
    id TEXT PRIMARY KEY,
    gender TEXT NOT NULL CHECK(gender IN ('Male','Female')),
    name TEXT NOT NULL,
    weight_min REAL,
    weight_max REAL,
    UNIQUE(gender, name)
);

INSERT INTO weight_classes (id, gender, name, weight_min, weight_max) VALUES
('M_52', 'Male', 'DO 52 KG', NULL, 52.0),
('M_56', 'Male', 'DO 56 KG', 52.01, 56.0),
('M_60', 'Male', 'DO 60 KG', 56.01, 60.0),
('M_67_5', 'Male', 'DO 67.5 KG', 60.01, 67.5),
('M_75', 'Male', 'DO 75 KG', 67.51, 75.0),
('M_82_5', 'Male', 'DO 82.5 KG', 75.01, 82.5),
('M_90', 'Male', 'DO 90 KG', 82.51, 90.0),
('M_100', 'Male', 'DO 100 KG', 90.01, 100.0),
('M_110', 'Male', 'DO 110 KG', 100.01, 110.0),
('M_125', 'Male', 'DO 125 KG', 110.01, 125.0),
('M_140', 'Male', 'DO 140 KG', 125.01, 140.0),
('M_140_PLUS', 'Male', '+ 140 KG', 140.01, NULL);

INSERT INTO weight_classes (id, gender, name, weight_min, weight_max) VALUES
('F_47', 'Female', 'DO 47 KG', NULL, 47.0),
('F_52', 'Female', 'DO 52 KG', 47.01, 52.0),
('F_57', 'Female', 'DO 57 KG', 52.01, 57.0),
('F_63', 'Female', 'DO 63 KG', 57.01, 63.0),
('F_72', 'Female', 'DO 72 KG', 63.01, 72.0),
('F_84', 'Female', 'DO 84 KG', 72.01, 84.0),
('F_84_PLUS', 'Female', '+ 84 KG', 84.01, NULL);

CREATE TABLE competitors (
    id TEXT PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    birth_date TEXT NOT NULL,
    gender TEXT NOT NULL CHECK(gender IN ('Male','Female')),
    club TEXT,
    city TEXT,
    notes TEXT,
    photo_data BLOB,
    photo_format TEXT DEFAULT 'webp',
    photo_metadata TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

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
    FOREIGN KEY (age_category_id) REFERENCES age_categories(id),
    FOREIGN KEY (weight_class_id) REFERENCES weight_classes(id),
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
    FOREIGN KEY (registration_id) REFERENCES registrations(id) ON DELETE CASCADE,
    UNIQUE(registration_id, lift_type, attempt_number)
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
    FOREIGN KEY (registration_id) REFERENCES registrations(id) ON DELETE CASCADE
);

CREATE TABLE contest_states (
    contest_id TEXT PRIMARY KEY,
    status TEXT NOT NULL CHECK(status IN ('Setup','InProgress','Paused','Completed')),
    current_round INTEGER DEFAULT 1,
    current_lift TEXT CHECK(current_lift IN ('Bench','Squat','Deadlift')),
    current_attempt_number INTEGER CHECK(current_attempt_number IN (1,2,3,4)),
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (contest_id) REFERENCES contests(id) ON DELETE CASCADE
);

CREATE TABLE settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    data TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE system_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    level TEXT NOT NULL,
    message TEXT NOT NULL,
    metadata TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

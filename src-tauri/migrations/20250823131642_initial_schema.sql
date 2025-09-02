-- Initial schema for Werewolf powerlifting contest management
-- Based on Polish Powerlifting Federation requirements and real CSV data analysis

-- Enable foreign keys for SQLite
PRAGMA foreign_keys = ON;

-- Contests table
CREATE TABLE contests (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    date TEXT NOT NULL, -- ISO 8601 format
    location TEXT NOT NULL,
    discipline TEXT NOT NULL CHECK(discipline IN ('Bench','Squat','Deadlift','Powerlifting')),
    status TEXT NOT NULL DEFAULT 'Setup' CHECK(status IN ('Setup','InProgress','Paused','Completed')),
    federation_rules TEXT, -- Nullable - not every competition needs federation
    competition_type TEXT, -- Local/Regional/National/International
    organizer TEXT, -- Who is organizing this competition
    notes TEXT, -- Additional competition notes
    is_archived BOOLEAN NOT NULL DEFAULT FALSE, -- For competition history
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Reusable age categories based on Polish federation rules
CREATE TABLE age_categories (
    id TEXT PRIMARY KEY, -- e.g., 'JUNIOR13', 'SENIOR', 'VETERAN40'
    name TEXT NOT NULL UNIQUE, -- 'Junior 13', 'Senior', 'Veteran 40'
    min_age INTEGER, -- Minimum age (NULL for no limit)
    max_age INTEGER  -- Maximum age (NULL for no limit)
);

-- Pre-populate age categories based on CSV data (non-overlapping ranges)
INSERT INTO age_categories (id, name, min_age, max_age) VALUES
('JUNIOR13', 'Junior 13', 13, 15),
('JUNIOR16', 'Junior 16', 16, 18),
('JUNIOR19', 'Junior 19', 19, 19), -- Single year to avoid overlap
('JUNIOR23', 'Junior 23', 20, 23),
('SENIOR', 'Senior', 24, 39),
('VETERAN40', 'Veteran 40', 40, 49),
('VETERAN50', 'Veteran 50', 50, 59),
('VETERAN60', 'Veteran 60', 60, 69),
('VETERAN70', 'Veteran 70', 70, NULL);

-- Reusable weight classes
CREATE TABLE weight_classes (
    id TEXT PRIMARY KEY,
    gender TEXT NOT NULL CHECK(gender IN ('Male','Female')),
    name TEXT NOT NULL, -- e.g., "DO 75 KG", "+ 140 KG"
    weight_min REAL, -- Minimum weight in kg (NULL for open class)
    weight_max REAL, -- Maximum weight in kg (NULL for open class)
    UNIQUE(gender, name)
);

-- Pre-populate common weight classes (Male - based on CSV data)
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

-- Female weight classes (common IPF classes)
INSERT INTO weight_classes (id, gender, name, weight_min, weight_max) VALUES
('F_47', 'Female', 'DO 47 KG', NULL, 47.0),
('F_52', 'Female', 'DO 52 KG', 47.01, 52.0),
('F_57', 'Female', 'DO 57 KG', 52.01, 57.0),
('F_63', 'Female', 'DO 63 KG', 57.01, 63.0),
('F_72', 'Female', 'DO 72 KG', 63.01, 72.0),
('F_84', 'Female', 'DO 84 KG', 72.01, 84.0),
('F_84_PLUS', 'Female', '+ 84 KG', 84.01, NULL);

-- Equipment is handled via boolean flags in registrations table
-- (equipment_m, equipment_sm, equipment_t) matching CSV data structure

-- Competitors table - Only stores permanent information about the person
CREATE TABLE competitors (
    id TEXT PRIMARY KEY,
    first_name TEXT NOT NULL, -- IMIĘ
    last_name TEXT NOT NULL,  -- NAZWISKO
    birth_date TEXT NOT NULL, -- Full birth date for accurate age calculation (YYYY-MM-DD)
    gender TEXT NOT NULL CHECK(gender IN ('Male','Female')),
    club TEXT, -- KLUB - can change over time, but stored here for simplicity
    city TEXT, -- MIEJSCOWOŚĆ - hometown
    notes TEXT, -- Additional notes about the competitor
    photo_data BLOB, -- Photo stored as BLOB
    photo_format TEXT DEFAULT 'webp', -- Photo format (webp, jpeg, png)
    photo_metadata TEXT, -- JSON with original dimensions, file size, etc.
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Registrations table - Links a competitor to a specific contest with day-of details
CREATE TABLE registrations (
    id TEXT PRIMARY KEY,
    contest_id TEXT NOT NULL,
    competitor_id TEXT NOT NULL,
    
    -- Categories determined at registration based on age/weight on contest day
    age_category_id TEXT NOT NULL,
    weight_class_id TEXT NOT NULL,
    
    -- Equipment flags based on CSV data (M, SM, T columns)
    equipment_m BOOLEAN NOT NULL DEFAULT FALSE, -- Multi-ply equipment
    equipment_sm BOOLEAN NOT NULL DEFAULT FALSE, -- Single-ply equipment  
    equipment_t BOOLEAN NOT NULL DEFAULT FALSE, -- Equipped shirt/suit
    
    -- Day-of competition data
    bodyweight REAL NOT NULL, -- WAGA - actual weight on contest day
    lot_number TEXT, -- Competition number for the day
    personal_record_at_entry REAL, -- REKORD ŻYCIOWY - PR at time of entry
    
    -- Calculated coefficients (stored for performance)
    reshel_coefficient REAL, -- WSP. RESHEL
    mccullough_coefficient REAL, -- WSP. MCCULLOUGH
    
    -- Equipment-specific settings
    rack_height_squat INTEGER, -- WYS. STOJAKA for squat (1-20)
    rack_height_bench INTEGER, -- WYS. STOJAKA for bench (1-20)
    
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (contest_id) REFERENCES contests(id) ON DELETE CASCADE,
    FOREIGN KEY (competitor_id) REFERENCES competitors(id) ON DELETE CASCADE,
    FOREIGN KEY (age_category_id) REFERENCES age_categories(id),
    FOREIGN KEY (weight_class_id) REFERENCES weight_classes(id),
    UNIQUE(contest_id, competitor_id) -- One registration per competitor per contest
);

-- Attempts table - tracks all lift attempts (now linked to registrations)
CREATE TABLE attempts (
    id TEXT PRIMARY KEY,
    registration_id TEXT NOT NULL, -- Changed from competitor_id to registration_id
    lift_type TEXT NOT NULL CHECK(lift_type IN ('Bench','Squat','Deadlift')),
    attempt_number INTEGER NOT NULL CHECK(attempt_number IN (1,2,3,4)), -- Added 4th for record attempts
    weight REAL NOT NULL CHECK(weight >= 0), -- Allow 0 for not-yet-attempted lifts
    status TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending','Successful','Failed','Skipped')),
    timestamp TEXT, -- When attempt was completed
    judge1_decision BOOLEAN, -- First judge decision (NULL = not judged yet)
    judge2_decision BOOLEAN, -- Second judge decision
    judge3_decision BOOLEAN, -- Third judge decision
    notes TEXT, -- Additional notes about the attempt
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (registration_id) REFERENCES registrations(id) ON DELETE CASCADE,
    UNIQUE(registration_id, lift_type, attempt_number) -- One attempt per lift per number
);

-- Current lift state - for real-time display
CREATE TABLE current_lifts (
    id INTEGER PRIMARY KEY CHECK (id = 1), -- Only one current lift at a time
    contest_id TEXT NOT NULL,
    registration_id TEXT NOT NULL, -- Changed from competitor_id to registration_id
    lift_type TEXT NOT NULL CHECK(lift_type IN ('Bench','Squat','Deadlift')),
    attempt_number INTEGER NOT NULL CHECK(attempt_number IN (1,2,3,4)),
    weight REAL NOT NULL,
    timer_start TEXT, -- ISO 8601 timestamp when timer started
    timer_duration INTEGER NOT NULL DEFAULT 60, -- Timer duration in seconds
    rack_height INTEGER, -- Current rack height setting
    is_active BOOLEAN NOT NULL DEFAULT FALSE, -- Whether lift is currently happening
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (contest_id) REFERENCES contests(id) ON DELETE CASCADE,
    FOREIGN KEY (registration_id) REFERENCES registrations(id) ON DELETE CASCADE
);

-- Results table - calculated final results (now supports multiple rankings)
CREATE TABLE results (
    id TEXT PRIMARY KEY,
    registration_id TEXT NOT NULL, -- Changed from competitor_id to registration_id
    contest_id TEXT NOT NULL,
    
    -- Best lifts for each discipline
    best_bench REAL DEFAULT 0,
    best_squat REAL DEFAULT 0,
    best_deadlift REAL DEFAULT 0,
    total_weight REAL NOT NULL DEFAULT 0, -- Sum of best lifts
    coefficient_points REAL NOT NULL DEFAULT 0, -- total_weight * reshel * mccullough
    
    -- Multiple ranking support (based on CSV files)
    place_open INTEGER, -- Overall ranking (OPEN.csv)
    place_in_age_class INTEGER, -- Ranking within age category (KATEGORIE WIEKOWE.csv)
    place_in_weight_class INTEGER, -- Ranking within weight class (KATEGORIE WAGOWE.csv)
    
    -- Competition flags
    is_disqualified BOOLEAN NOT NULL DEFAULT FALSE,
    disqualification_reason TEXT,
    
    -- Record tracking
    broke_record BOOLEAN NOT NULL DEFAULT FALSE,
    record_type TEXT, -- 'Personal', 'Club', 'Regional', 'National', 'World'
    
    -- Timestamps
    calculated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (registration_id) REFERENCES registrations(id) ON DELETE CASCADE,
    FOREIGN KEY (contest_id) REFERENCES contests(id) ON DELETE CASCADE,
    UNIQUE(registration_id) -- One result per registration
);

-- Contest states table for tracking competition progress
CREATE TABLE contest_states (
    contest_id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'Setup',
    current_lift TEXT,
    current_round INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (contest_id) REFERENCES contests(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX idx_registrations_contest ON registrations(contest_id);
CREATE INDEX idx_registrations_competitor ON registrations(competitor_id);
CREATE INDEX idx_registrations_age_category ON registrations(age_category_id);
CREATE INDEX idx_registrations_weight_class ON registrations(weight_class_id);
CREATE INDEX idx_attempts_registration ON attempts(registration_id);
CREATE INDEX idx_attempts_lift_type ON attempts(lift_type);
CREATE INDEX idx_results_contest ON results(contest_id);
CREATE INDEX idx_results_registration ON results(registration_id);
CREATE INDEX idx_competitors_has_photo ON competitors(photo_data IS NOT NULL);
CREATE INDEX idx_competitors_photo_format ON competitors(photo_format);

-- Triggers to update timestamps
CREATE TRIGGER update_competitors_timestamp 
    AFTER UPDATE ON competitors
    BEGIN
        UPDATE competitors SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

CREATE TRIGGER update_current_lifts_timestamp 
    AFTER UPDATE ON current_lifts
    BEGIN
        UPDATE current_lifts SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

CREATE TRIGGER update_contests_timestamp 
    AFTER UPDATE ON contests
    BEGIN
        UPDATE contests SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;
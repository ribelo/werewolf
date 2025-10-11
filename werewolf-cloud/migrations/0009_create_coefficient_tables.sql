-- Create tables to store Reshel bodyweight coefficients and McCullough age coefficients
-- allowing runtime edits without redeploying worker code.

CREATE TABLE IF NOT EXISTS reshel_coefficients (
    gender TEXT NOT NULL CHECK (gender IN ('male', 'female')),
    bodyweight_kg REAL NOT NULL,
    coefficient REAL NOT NULL,
    source TEXT NOT NULL,
    retrieved_at TEXT NOT NULL,
    notes TEXT,
    PRIMARY KEY (gender, bodyweight_kg)
);

CREATE INDEX IF NOT EXISTS reshel_coefficients_bodyweight_idx
    ON reshel_coefficients (gender, bodyweight_kg);

CREATE TABLE IF NOT EXISTS mccullough_coefficients (
    age INTEGER PRIMARY KEY,
    coefficient REAL NOT NULL,
    source TEXT NOT NULL,
    retrieved_at TEXT NOT NULL,
    notes TEXT
);

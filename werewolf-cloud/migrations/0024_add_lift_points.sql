-- Add individual lift points columns to results table
ALTER TABLE results ADD COLUMN squat_points REAL DEFAULT 0;
ALTER TABLE results ADD COLUMN bench_points REAL DEFAULT 0;
ALTER TABLE results ADD COLUMN deadlift_points REAL DEFAULT 0;
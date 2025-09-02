-- Fix weight constraint and status values for attempts table
-- This migration allows weight >= 0 and updates status from 'Good' to 'Successful'

-- First, update any existing 'Good' status to 'Successful'
UPDATE attempts SET status = 'Successful' WHERE status = 'Good';

-- Note: SQLite doesn't support ALTER COLUMN with CHECK constraints directly
-- The weight constraint needs to be updated via table recreation, which is done manually
-- The initial schema has been updated for new database installations

-- For reference, the correct constraints should be:
-- weight REAL NOT NULL CHECK(weight >= 0) -- Allow 0 for not-yet-attempted lifts  
-- status TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending','Successful','Failed','Skipped'))
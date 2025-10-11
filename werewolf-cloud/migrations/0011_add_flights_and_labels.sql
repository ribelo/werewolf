-- Add flight columns and labels to registrations; active flight to contests
ALTER TABLE registrations ADD COLUMN flight_code TEXT;
ALTER TABLE registrations ADD COLUMN flight_order INTEGER;
ALTER TABLE registrations ADD COLUMN labels TEXT DEFAULT '[]';
ALTER TABLE contests ADD COLUMN active_flight TEXT;

-- Ensure existing rows have JSON array in labels column
UPDATE registrations SET labels = '[]' WHERE labels IS NULL;

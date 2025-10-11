-- Ensure registrations default to flight A and normalise existing codes

PRAGMA foreign_keys = OFF;

UPDATE registrations
SET flight_code = UPPER(TRIM(flight_code))
WHERE flight_code IS NOT NULL;

UPDATE registrations
SET flight_code = 'A'
WHERE flight_code IS NULL
   OR length(flight_code) = 0
   OR flight_code NOT GLOB '[A-Z]';

PRAGMA foreign_keys = ON;

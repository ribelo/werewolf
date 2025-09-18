ALTER TABLE plate_sets ADD COLUMN color TEXT DEFAULT '#374151';

UPDATE plate_sets SET color = '#DC2626' WHERE plate_weight IN (25.0, 2.5);
UPDATE plate_sets SET color = '#2563EB' WHERE plate_weight IN (20.0, 2.0);
UPDATE plate_sets SET color = '#EAB308' WHERE plate_weight IN (15.0, 1.5);
UPDATE plate_sets SET color = '#16A34A' WHERE plate_weight IN (10.0, 1.25, 1.0);
UPDATE plate_sets SET color = '#F8FAFC' WHERE plate_weight = 5.0;
UPDATE plate_sets SET color = '#6B7280' WHERE plate_weight <= 1.0 AND color = '#374151';

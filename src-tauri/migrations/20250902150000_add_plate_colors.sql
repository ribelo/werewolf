-- Add plate color support to enable customizable plate visualization
-- Stores hex color codes for each plate set, enabling competition-specific color schemes

-- Add color column to plate_sets table
ALTER TABLE plate_sets ADD COLUMN color TEXT DEFAULT '#374151';

-- Set default colors for existing plates based on standard Eleiko powerlifting colors
-- These provide proper color coding even for existing competitions

-- Standard red plates (25kg, 2.5kg)
UPDATE plate_sets SET color = '#DC2626' WHERE plate_weight IN (25.0, 2.5);

-- Standard blue plates (20kg, 2kg)  
UPDATE plate_sets SET color = '#2563EB' WHERE plate_weight IN (20.0, 2.0);

-- Standard yellow plates (15kg, 1.5kg)
UPDATE plate_sets SET color = '#EAB308' WHERE plate_weight IN (15.0, 1.5);

-- Standard green plates (10kg, 1.25kg, 1kg)
UPDATE plate_sets SET color = '#16A34A' WHERE plate_weight IN (10.0, 1.25, 1.0);

-- Standard white plates (5kg)
UPDATE plate_sets SET color = '#F8FAFC' WHERE plate_weight = 5.0;

-- Gray plates for other weights (0.5kg and non-standard weights)
UPDATE plate_sets SET color = '#6B7280' WHERE plate_weight <= 1.0 AND color = '#374151';

-- Note: The default gray color (#374151) will be used for any custom weights
-- that don't match standard powerlifting plates
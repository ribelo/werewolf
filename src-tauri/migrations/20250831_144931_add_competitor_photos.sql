-- Add photo support to competitors table
-- This migration adds the ability to store photo paths for competitor images

-- Add photo_path column to competitors table
ALTER TABLE competitors ADD COLUMN photo_path TEXT;

-- Add index for photo_path for faster queries when filtering competitors with/without photos
CREATE INDEX idx_competitors_photo_path ON competitors(photo_path);

-- Update the timestamp trigger for competitors table (already exists, but good to be explicit)
-- The existing trigger will handle updated_at when photo_path is modified
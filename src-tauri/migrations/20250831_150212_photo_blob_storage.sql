-- Replace file path photo storage with BLOB storage
-- This migration moves from storing photo file paths to storing actual photo bytes in the database

-- Remove old photo_path column and its index
DROP INDEX IF EXISTS idx_competitors_photo_path;
ALTER TABLE competitors DROP COLUMN photo_path;

-- Add new photo storage columns
ALTER TABLE competitors ADD COLUMN photo_data BLOB;
ALTER TABLE competitors ADD COLUMN photo_format TEXT DEFAULT 'webp';
ALTER TABLE competitors ADD COLUMN photo_metadata TEXT; -- JSON with original dimensions, file size, etc.

-- Add index for photo_data to quickly find competitors with/without photos
CREATE INDEX idx_competitors_has_photo ON competitors(photo_data IS NOT NULL);

-- Add index for photo format for potential future filtering
CREATE INDEX idx_competitors_photo_format ON competitors(photo_format);
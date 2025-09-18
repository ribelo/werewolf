-- Migration: Fix settings table schema to use JSON data column
-- This migration ensures the settings table uses the new JSON data column schema

-- Create the new settings table with correct schema if it doesn't exist
CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    data TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Insert default settings if table is empty
INSERT OR IGNORE INTO settings (id, data, created_at, updated_at)
VALUES (1, '{
  "language": "pl",
  "ui": {
    "theme": "light",
    "showWeights": true,
    "showAttempts": true
  },
  "competition": {
    "federationRules": "IPF",
    "defaultBarWeight": 20
  },
  "database": {
    "backupEnabled": true,
    "autoBackupInterval": 24
  }
}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
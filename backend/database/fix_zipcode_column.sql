-- Migration: Fix zip_code column name
-- Purpose: Ensure zip_code column exists (some databases may have 'zipcode' instead)

-- Add zip_code column if it doesn't exist
ALTER TABLE locations
ADD COLUMN IF NOT EXISTS zip_code VARCHAR(10);

-- If the old 'zipcode' column exists, copy data and drop it
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'locations' AND column_name = 'zipcode'
    ) THEN
        -- Copy data from zipcode to zip_code
        UPDATE locations SET zip_code = zipcode WHERE zip_code IS NULL;

        -- Drop the old column
        ALTER TABLE locations DROP COLUMN zipcode;

        RAISE NOTICE 'Migrated zipcode column to zip_code';
    END IF;
END $$;

-- Ensure column exists with correct type
ALTER TABLE locations
ALTER COLUMN zip_code TYPE VARCHAR(10);

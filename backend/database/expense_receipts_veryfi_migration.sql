-- Migration to add Veryfi OCR fields to expense_receipts table
-- This adds fields needed for storing receipt upload metadata and OCR data

-- Add user_id to allow receipts without expenses (for upload before expense creation)
ALTER TABLE expense_receipts
ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);

-- Add Veryfi OCR fields
ALTER TABLE expense_receipts
ADD COLUMN IF NOT EXISTS veryfi_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS veryfi_url TEXT,
ADD COLUMN IF NOT EXISTS ocr_data JSONB;

-- Add updated_at timestamp for tracking changes
ALTER TABLE expense_receipts
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Rename uploaded_at to created_at for consistency
ALTER TABLE expense_receipts
RENAME COLUMN uploaded_at TO created_at;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_expense_receipts_user_id ON expense_receipts(user_id);
CREATE INDEX IF NOT EXISTS idx_expense_receipts_veryfi_id ON expense_receipts(veryfi_id);
CREATE INDEX IF NOT EXISTS idx_expense_receipts_expense_id ON expense_receipts(expense_id);

-- Add comments for documentation
COMMENT ON COLUMN expense_receipts.user_id IS 'User who uploaded the receipt (allows upload before expense creation)';
COMMENT ON COLUMN expense_receipts.veryfi_id IS 'Veryfi document ID for the processed receipt';
COMMENT ON COLUMN expense_receipts.veryfi_url IS 'URL to view processed receipt in Veryfi dashboard';
COMMENT ON COLUMN expense_receipts.ocr_data IS 'Full OCR extracted data from Veryfi (JSON)';
COMMENT ON COLUMN expense_receipts.expense_id IS 'Associated expense (nullable - can be linked later)';

-- Make expense_id nullable to allow receipts to exist before expense creation
ALTER TABLE expense_receipts
ALTER COLUMN expense_id DROP NOT NULL;

-- Add xero_sync_error column to track failed auto-sync attempts
-- This provides a safety net for manual retry if auto-sync fails

ALTER TABLE expenses
ADD COLUMN IF NOT EXISTS xero_sync_error TEXT;

COMMENT ON COLUMN expenses.xero_sync_error IS 'Error message if Xero auto-sync failed (for manual retry)';

-- Index for finding expenses that need manual sync
CREATE INDEX IF NOT EXISTS idx_expenses_xero_sync_error
ON expenses(xero_sync_error)
WHERE xero_sync_error IS NOT NULL AND xero_invoice_id IS NULL;

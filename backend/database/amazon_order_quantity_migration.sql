-- Migration: Preserve Amazon order quantities on expenses
-- Purpose: Keep punchout cart quantity/unit price available after cart checkout so
-- Amazon OrderRequest cXML can resubmit the approved order with the original line quantity.

ALTER TABLE expenses
ADD COLUMN IF NOT EXISTS amazon_quantity INTEGER,
ADD COLUMN IF NOT EXISTS amazon_unit_price DECIMAL(10, 2);

COMMENT ON COLUMN expenses.amazon_quantity IS 'Original Amazon punchout line quantity for OrderRequest ItemOut quantity';
COMMENT ON COLUMN expenses.amazon_unit_price IS 'Original Amazon punchout unit price for OrderRequest ItemDetail UnitPrice';

-- Existing order placement code uses processing as a transient lock state.
ALTER TABLE expenses
DROP CONSTRAINT IF EXISTS check_amazon_order_status;

ALTER TABLE expenses
ADD CONSTRAINT check_amazon_order_status
CHECK (amazon_order_status IS NULL OR amazon_order_status IN ('pending', 'processing', 'sent', 'confirmed', 'failed'));

CREATE INDEX IF NOT EXISTS idx_expenses_amazon_quantity ON expenses(amazon_quantity)
WHERE amazon_quantity IS NOT NULL;

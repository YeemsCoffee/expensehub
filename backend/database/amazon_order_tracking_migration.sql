-- Migration: Add Amazon Order Tracking Fields
-- Purpose: Store Amazon SupplierPartAuxiliaryID (SPAID) and Purchase Order numbers
-- for proper order placement after approval

-- 1. Add amazon_spaid to cart_items table
-- This stores the cart/session ID from Amazon (format: "135-4871846-5290837,1")
ALTER TABLE cart_items
ADD COLUMN IF NOT EXISTS amazon_spaid VARCHAR(255);

COMMENT ON COLUMN cart_items.amazon_spaid IS 'Amazon SupplierPartAuxiliaryID (cart session ID + line number) for order placement';

-- 2. Add Amazon order tracking fields to expenses table
ALTER TABLE expenses
ADD COLUMN IF NOT EXISTS amazon_spaid VARCHAR(255),
ADD COLUMN IF NOT EXISTS amazon_po_number VARCHAR(100),
ADD COLUMN IF NOT EXISTS amazon_order_status VARCHAR(50),
ADD COLUMN IF NOT EXISTS amazon_order_sent_at TIMESTAMP;

COMMENT ON COLUMN expenses.amazon_spaid IS 'Amazon SupplierPartAuxiliaryID for placing orders';
COMMENT ON COLUMN expenses.amazon_po_number IS 'Amazon Purchase Order confirmation number';
COMMENT ON COLUMN expenses.amazon_order_status IS 'Status of order sent to Amazon (pending, sent, confirmed, failed)';
COMMENT ON COLUMN expenses.amazon_order_sent_at IS 'Timestamp when order was sent to Amazon PO URL';

-- 3. Create index for querying Amazon orders
CREATE INDEX IF NOT EXISTS idx_expenses_amazon_po ON expenses(amazon_po_number) WHERE amazon_po_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_amazon_status ON expenses(amazon_order_status) WHERE amazon_order_status IS NOT NULL;

-- 4. Add check constraint for valid Amazon order statuses
ALTER TABLE expenses
DROP CONSTRAINT IF EXISTS check_amazon_order_status;

ALTER TABLE expenses
ADD CONSTRAINT check_amazon_order_status
CHECK (amazon_order_status IS NULL OR amazon_order_status IN ('pending', 'sent', 'confirmed', 'failed'));

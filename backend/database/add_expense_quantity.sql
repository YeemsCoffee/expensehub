-- Add quantity column to expenses table
-- Fixes Amazon OrderRequest quantity/unit-price mismatch:
-- cart checkout stores amount = price * quantity, but the OrderRequest
-- was always sending quantity=1 with UnitPrice = line total, which
-- mismatches the punchout cart and causes Amazon to hold orders for approval.

ALTER TABLE expenses
ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1;

ALTER TABLE expenses
ADD COLUMN IF NOT EXISTS unit_price NUMERIC(12,2);

COMMENT ON COLUMN expenses.quantity IS 'Item quantity from cart checkout; used to send correct quantity and unit price in Amazon OrderRequests';
COMMENT ON COLUMN expenses.unit_price IS 'Per-unit price from cart checkout; avoids rounding drift when deriving unit price from amount/quantity';

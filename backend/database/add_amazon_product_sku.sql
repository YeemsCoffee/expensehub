-- Add Amazon product SKU field to expenses table
-- This stores the SupplierPartID from Amazon which is required for OrderRequest

ALTER TABLE expenses
ADD COLUMN IF NOT EXISTS amazon_product_sku VARCHAR(255);

COMMENT ON COLUMN expenses.amazon_product_sku IS 'Amazon SupplierPartID (product SKU) required for placing orders';

-- Create index for querying Amazon products
CREATE INDEX IF NOT EXISTS idx_expenses_amazon_sku ON expenses(amazon_product_sku)
WHERE amazon_product_sku IS NOT NULL;

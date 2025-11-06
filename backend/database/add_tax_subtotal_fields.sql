-- Add tax and subtotal fields to expenses table
-- These fields allow better expense tracking with tax breakdown

-- Add subtotal field (amount before tax)
ALTER TABLE expenses
ADD COLUMN IF NOT EXISTS subtotal DECIMAL(10, 2);

-- Add tax field (tax amount)
ALTER TABLE expenses
ADD COLUMN IF NOT EXISTS tax DECIMAL(10, 2) DEFAULT 0;

-- Add tip field (for meals/services)
ALTER TABLE expenses
ADD COLUMN IF NOT EXISTS tip DECIMAL(10, 2) DEFAULT 0;

-- Add comments for documentation
COMMENT ON COLUMN expenses.subtotal IS 'Amount before tax';
COMMENT ON COLUMN expenses.tax IS 'Tax amount from receipt';
COMMENT ON COLUMN expenses.tip IS 'Tip amount (for meals/services)';
COMMENT ON COLUMN expenses.amount IS 'Total amount including tax and tip';

-- Note: amount = subtotal + tax + tip

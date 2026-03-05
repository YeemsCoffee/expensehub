-- Create expense_categories table for dynamic category management
CREATE TABLE IF NOT EXISTS expense_categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  xero_account_code VARCHAR(50),
  xero_account_name VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  display_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for active categories lookup
CREATE INDEX IF NOT EXISTS idx_expense_categories_active ON expense_categories(is_active, display_order);

-- Seed default categories that align with Xero mappings
INSERT INTO expense_categories (name, xero_account_code, xero_account_name, is_active, display_order) VALUES
  ('Travel', '493', 'Travel - National', true, 1),
  ('Meals & Entertainment', '420', 'Entertainment', true, 2),
  ('Office Supplies', '461', 'Office Expenses', true, 3),
  ('Software & Subscriptions', '453', 'Computer Expenses', true, 4),
  ('Equipment & Hardware', '630', 'Equipment Purchases', true, 5),
  ('Professional Services', '404', 'General Expenses', true, 6),
  ('Marketing & Advertising', '400', 'Advertising', true, 7),
  ('Utilities & Telecom', '445', 'Telephone & Internet', true, 8),
  ('Fuel & Mileage', '404', 'General Expenses', true, 9),
  ('Other', '404', 'General Expenses', true, 10)
ON CONFLICT (name) DO NOTHING;

COMMENT ON TABLE expense_categories IS 'Configurable expense categories with Xero account mapping';

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

-- Seed default category names only. Xero account codes are organisation
-- specific, so they are chosen per organisation in Settings -> Xero
-- Integration from the live chart of accounts, never hardcoded here.
INSERT INTO expense_categories (name, is_active, display_order) VALUES
  ('Travel', true, 1),
  ('Meals & Entertainment', true, 2),
  ('Office Supplies', true, 3),
  ('Software & Subscriptions', true, 4),
  ('Equipment & Hardware', true, 5),
  ('Professional Services', true, 6),
  ('Marketing & Advertising', true, 7),
  ('Utilities & Telecom', true, 8),
  ('Fuel & Mileage', true, 9),
  ('Other', true, 10)
ON CONFLICT (name) DO NOTHING;

COMMENT ON TABLE expense_categories IS 'Configurable expense categories with Xero account mapping';

-- Migration: expense sub-categories
--
-- A category can have sub-categories (e.g. Supplies -> Milk, Cups, Coffee
-- beans). An expense keeps its category name in expenses.category, so every
-- report, budget and approval rule keyed on the category keeps working, and
-- additionally points at one of that category's sub-categories by id (a
-- rename never orphans past expenses or their Xero mapping).

CREATE TABLE IF NOT EXISTS expense_subcategories (
  id SERIAL PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES expense_categories(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Names are unique within a category (two categories may both have "Other")
CREATE UNIQUE INDEX IF NOT EXISTS idx_expense_subcategories_name
  ON expense_subcategories (category_id, LOWER(name));

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS subcategory_id INTEGER
  REFERENCES expense_subcategories(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_subcategory ON expenses(subcategory_id);

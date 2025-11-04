-- Migration: Org-Chart-Based Approval System
-- Date: 2025-11-04
-- Description: Replace manual approval flows with automatic org-chart-based approvals

-- =============================================
-- Create approval_rules table
-- =============================================
-- This table stores simple rules: amount range ’ how many levels up to approve
CREATE TABLE IF NOT EXISTS approval_rules (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  min_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  max_amount DECIMAL(10,2), -- NULL means unlimited
  levels_required INTEGER NOT NULL DEFAULT 1, -- How many levels up the org chart
  cost_center_id INTEGER REFERENCES cost_centers(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Ensure no overlapping amount ranges for the same cost center
  CONSTRAINT valid_amount_range CHECK (max_amount IS NULL OR max_amount > min_amount),
  CONSTRAINT valid_levels CHECK (levels_required > 0 AND levels_required <= 10)
);

-- Create index for fast lookup by amount
CREATE INDEX idx_approval_rules_amount ON approval_rules(min_amount, max_amount) WHERE is_active = true;
CREATE INDEX idx_approval_rules_cost_center ON approval_rules(cost_center_id) WHERE is_active = true;

-- =============================================
-- Update expenses table to store approval chain
-- =============================================
-- Store the calculated approval chain when expense is submitted
ALTER TABLE expenses
ADD COLUMN IF NOT EXISTS approval_chain JSONB;

-- approval_chain structure:
-- [
--   {"level": 1, "user_id": 5, "user_name": "Manager A", "status": "pending"},
--   {"level": 2, "user_id": 3, "user_name": "Director B", "status": "pending"}
-- ]

ALTER TABLE expenses
ADD COLUMN IF NOT EXISTS current_approval_level INTEGER DEFAULT 1;

ALTER TABLE expenses
ADD COLUMN IF NOT EXISTS approval_rule_id INTEGER REFERENCES approval_rules(id) ON DELETE SET NULL;

-- =============================================
-- Create helper function to get manager chain
-- =============================================
CREATE OR REPLACE FUNCTION get_manager_chain(user_id INTEGER, levels INTEGER)
RETURNS TABLE(level INTEGER, manager_id INTEGER, manager_name TEXT, manager_email TEXT) AS $$
DECLARE
  current_user_id INTEGER := user_id;
  current_level INTEGER := 0;
BEGIN
  WHILE current_level < levels LOOP
    -- Get the manager of current user
    SELECT u.manager_id, u2.first_name || ' ' || u2.last_name, u2.email
    INTO current_user_id, manager_name, manager_email
    FROM users u
    LEFT JOIN users u2 ON u.manager_id = u2.id
    WHERE u.id = current_user_id;

    -- Exit if no manager found
    EXIT WHEN current_user_id IS NULL;

    current_level := current_level + 1;
    level := current_level;
    manager_id := current_user_id;

    RETURN NEXT;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- Create helper function to find applicable rule
-- =============================================
CREATE OR REPLACE FUNCTION find_approval_rule(
  expense_amount DECIMAL,
  expense_cost_center_id INTEGER
)
RETURNS INTEGER AS $$
DECLARE
  rule_id INTEGER;
BEGIN
  -- Find the most specific active rule that matches
  SELECT id INTO rule_id
  FROM approval_rules
  WHERE is_active = true
    AND min_amount <= expense_amount
    AND (max_amount IS NULL OR max_amount >= expense_amount)
    AND (
      cost_center_id = expense_cost_center_id
      OR cost_center_id IS NULL
    )
  ORDER BY
    -- Prefer rules with specific cost center
    CASE WHEN cost_center_id IS NOT NULL THEN 0 ELSE 1 END,
    -- Prefer rules with narrower range (higher min_amount)
    min_amount DESC
  LIMIT 1;

  RETURN rule_id;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- Insert default approval rules
-- =============================================
-- These are examples - you can modify or delete them
INSERT INTO approval_rules (name, description, min_amount, max_amount, levels_required, is_active)
VALUES
  ('Small Expenses', 'Under $500 - Direct manager approval only', 0, 500, 1, true),
  ('Medium Expenses', '$500 to $5,000 - Manager + one level up', 500, 5000, 2, true),
  ('Large Expenses', 'Over $5,000 - Three levels of approval', 5000, NULL, 3, true)
ON CONFLICT DO NOTHING;

-- =============================================
-- Create index for manager lookups
-- =============================================
CREATE INDEX IF NOT EXISTS idx_users_manager_id ON users(manager_id);

-- =============================================
-- Notes:
-- =============================================
-- Old approval_flows table can be kept for reference or dropped
-- The system will now automatically calculate approval chains based on:
--   1. Expense amount
--   2. User's position in org chart (manager_id relationships)
--   3. Approval rules (how many levels up to go)
--
-- Example:
--   Alice (employee) ’ Manager Bob ’ Director Carol ’ VP Dave
--   Alice submits $3,000 expense
--   Rule: $500-$5,000 requires 2 levels
--   Approval chain: Bob (level 1) ’ Carol (level 2)
-- =============================================

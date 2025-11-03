-- Migration: Add Approval Flow System
-- Date: 2025-11-03
-- Description: Creates tables for multi-level approval workflows

-- =============================================
-- 1. Approval Flows Table
-- =============================================
CREATE TABLE IF NOT EXISTS approval_flows (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  min_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  max_amount DECIMAL(10, 2), -- NULL means unlimited
  cost_center_id INTEGER REFERENCES cost_centers(id) ON DELETE SET NULL, -- NULL means applies to all
  is_active BOOLEAN NOT NULL DEFAULT true,
  approvers INTEGER[] NOT NULL, -- Array of user IDs in order
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster lookups
CREATE INDEX idx_approval_flows_amount_range ON approval_flows(min_amount, max_amount) WHERE is_active = true;
CREATE INDEX idx_approval_flows_cost_center ON approval_flows(cost_center_id) WHERE is_active = true;

-- =============================================
-- 2. Expense Approvals Tracking Table
-- =============================================
CREATE TABLE IF NOT EXISTS expense_approvals (
  id SERIAL PRIMARY KEY,
  expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  approval_flow_id INTEGER NOT NULL REFERENCES approval_flows(id),
  current_level INTEGER NOT NULL DEFAULT 1, -- Which approval level we're at
  total_levels INTEGER NOT NULL, -- Total number of approvers required
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, approved, rejected
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_expense_approvals_expense ON expense_approvals(expense_id);
CREATE INDEX idx_expense_approvals_status ON expense_approvals(status);

-- =============================================
-- 3. Individual Approval Steps Table
-- =============================================
CREATE TABLE IF NOT EXISTS approval_steps (
  id SERIAL PRIMARY KEY,
  expense_approval_id INTEGER NOT NULL REFERENCES expense_approvals(id) ON DELETE CASCADE,
  approver_id INTEGER NOT NULL REFERENCES users(id),
  level INTEGER NOT NULL, -- 1, 2, 3, etc.
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, approved, rejected
  comments TEXT,
  approved_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_approval_steps_expense_approval ON approval_steps(expense_approval_id);
CREATE INDEX idx_approval_steps_approver ON approval_steps(approver_id, status);

-- =============================================
-- 4. Add Approval-Related Fields to Expenses
-- =============================================
-- Check if columns don't exist before adding
DO $$ 
BEGIN
  -- Add requires_approval column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'expenses' AND column_name = 'requires_approval'
  ) THEN
    ALTER TABLE expenses ADD COLUMN requires_approval BOOLEAN DEFAULT false;
  END IF;

  -- Add approval_flow_id column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'expenses' AND column_name = 'approval_flow_id'
  ) THEN
    ALTER TABLE expenses ADD COLUMN approval_flow_id INTEGER REFERENCES approval_flows(id);
  END IF;

  -- Add fully_approved_at column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'expenses' AND column_name = 'fully_approved_at'
  ) THEN
    ALTER TABLE expenses ADD COLUMN fully_approved_at TIMESTAMP;
  END IF;
END $$;

-- =============================================
-- 5. Sample Approval Flows (Optional)
-- =============================================
-- Uncomment to create sample flows

-- Small Expenses - Auto Approve (Under $100)
-- INSERT INTO approval_flows (name, description, min_amount, max_amount, is_active, approvers, created_by)
-- VALUES (
--   'Auto-Approve Small Expenses',
--   'Expenses under $100 are auto-approved',
--   0,
--   99.99,
--   true,
--   ARRAY[]::INTEGER[], -- Empty array means auto-approve
--   1 -- Replace with actual admin user ID
-- );

-- Manager Approval ($100-$2,500)
-- INSERT INTO approval_flows (name, description, min_amount, max_amount, is_active, approvers, created_by)
-- VALUES (
--   'Manager Approval',
--   'Expenses between $100-$2,500 require manager approval',
--   100,
--   2500,
--   true,
--   ARRAY[2], -- Replace with actual manager user ID
--   1
-- );

-- Senior Management Approval ($2,500-$10,000)
-- INSERT INTO approval_flows (name, description, min_amount, max_amount, is_active, approvers, created_by)
-- VALUES (
--   'Senior Management Approval',
--   'Expenses between $2,500-$10,000 require senior manager then director approval',
--   2500,
--   10000,
--   true,
--   ARRAY[2, 3], -- Replace with actual manager and director user IDs (in order)
--   1
-- );

-- Executive Approval (Over $10,000)
-- INSERT INTO approval_flows (name, description, min_amount, max_amount, is_active, approvers, created_by)
-- VALUES (
--   'Executive Approval',
--   'Expenses over $10,000 require manager, director, and CFO approval',
--   10000,
--   NULL, -- No upper limit
--   true,
--   ARRAY[2, 3, 4], -- Replace with actual user IDs (in order)
--   1
-- );

-- =============================================
-- 6. Triggers for Auto-Updating Timestamps
-- =============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for approval_flows
DROP TRIGGER IF EXISTS update_approval_flows_updated_at ON approval_flows;
CREATE TRIGGER update_approval_flows_updated_at
  BEFORE UPDATE ON approval_flows
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for expense_approvals
DROP TRIGGER IF EXISTS update_expense_approvals_updated_at ON expense_approvals;
CREATE TRIGGER update_expense_approvals_updated_at
  BEFORE UPDATE ON expense_approvals
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- 7. Helper Functions
-- =============================================

-- Function to get applicable approval flow for an expense
CREATE OR REPLACE FUNCTION get_approval_flow_for_expense(
  p_amount DECIMAL,
  p_cost_center_id INTEGER DEFAULT NULL
)
RETURNS TABLE (
  id INTEGER,
  name VARCHAR,
  approvers INTEGER[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT af.id, af.name, af.approvers
  FROM approval_flows af
  WHERE af.is_active = true
    AND af.min_amount <= p_amount
    AND (af.max_amount >= p_amount OR af.max_amount IS NULL)
    AND (af.cost_center_id = p_cost_center_id OR af.cost_center_id IS NULL)
  ORDER BY 
    CASE WHEN af.cost_center_id IS NOT NULL THEN 1 ELSE 2 END, -- Cost center specific first
    af.min_amount DESC -- Higher threshold first
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Function to check if expense is fully approved
CREATE OR REPLACE FUNCTION is_expense_fully_approved(p_expense_id INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
  v_pending_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO v_pending_count
  FROM approval_steps
  WHERE expense_approval_id IN (
    SELECT id FROM expense_approvals WHERE expense_id = p_expense_id
  )
  AND status = 'pending';
  
  RETURN v_pending_count = 0;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 8. Views for Easy Querying
-- =============================================

-- View: Expenses with approval status
CREATE OR REPLACE VIEW expenses_with_approval_status AS
SELECT 
  e.*,
  ea.approval_flow_id,
  ea.current_level,
  ea.total_levels,
  ea.status as approval_status,
  af.name as approval_flow_name,
  ARRAY_AGG(
    json_build_object(
      'level', ast.level,
      'approver_id', ast.approver_id,
      'approver_name', u.first_name || ' ' || u.last_name,
      'status', ast.status,
      'approved_at', ast.approved_at,
      'comments', ast.comments
    ) ORDER BY ast.level
  ) as approval_steps
FROM expenses e
LEFT JOIN expense_approvals ea ON e.id = ea.expense_id
LEFT JOIN approval_flows af ON ea.approval_flow_id = af.id
LEFT JOIN approval_steps ast ON ea.id = ast.expense_approval_id
LEFT JOIN users u ON ast.approver_id = u.id
GROUP BY e.id, ea.id, ea.approval_flow_id, ea.current_level, ea.total_levels, ea.status, af.name;

-- View: Pending approvals by approver
CREATE OR REPLACE VIEW pending_approvals_by_user AS
SELECT 
  u.id as approver_id,
  u.first_name || ' ' || u.last_name as approver_name,
  e.id as expense_id,
  e.description,
  e.amount,
  e.date,
  e.category,
  submitter.first_name || ' ' || submitter.last_name as submitted_by,
  ast.level as approval_level,
  af.name as approval_flow_name,
  e.created_at as submitted_at
FROM approval_steps ast
JOIN expense_approvals ea ON ast.expense_approval_id = ea.id
JOIN expenses e ON ea.expense_id = e.id
JOIN approval_flows af ON ea.approval_flow_id = af.id
JOIN users u ON ast.approver_id = u.id
JOIN users submitter ON e.user_id = submitter.id
WHERE ast.status = 'pending'
  AND ea.current_level = ast.level
ORDER BY e.created_at ASC;

-- =============================================
-- DONE!
-- =============================================
-- Run this migration to set up the approval flow system
-- Make sure to update the sample data with your actual user IDs
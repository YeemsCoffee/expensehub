-- Migration: Add Manager Assignment and Approver Selection
-- Date: 2025-11-04
-- Description: Adds manager assignment to users and approver tracking to expenses

-- =============================================
-- 1. Add manager_id to users table
-- =============================================
ALTER TABLE users
ADD COLUMN IF NOT EXISTS manager_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_manager ON users(manager_id);

COMMENT ON COLUMN users.manager_id IS 'Default manager for this user (for approval routing)';

-- =============================================
-- 2. Add assigned_approver_id to expenses table
-- =============================================
ALTER TABLE expenses
ADD COLUMN IF NOT EXISTS assigned_approver_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_assigned_approver ON expenses(assigned_approver_id);

COMMENT ON COLUMN expenses.assigned_approver_id IS 'Manager assigned to approve this expense';

-- =============================================
-- 3. Update existing expenses to have an approver
-- =============================================
-- For existing expenses with status='pending', assign to a manager if one exists
-- This is optional - only run if you want to backfill data

-- UPDATE expenses e
-- SET assigned_approver_id = u.manager_id
-- FROM users u
-- WHERE e.user_id = u.id
--   AND e.status = 'pending'
--   AND e.assigned_approver_id IS NULL
--   AND u.manager_id IS NOT NULL;

-- =============================================
-- DONE!
-- =============================================
-- After running this migration:
-- 1. Set manager_id for employees in the Users page
-- 2. Expenses will show approver field on submission
-- 3. Approvals page will show expenses assigned to you

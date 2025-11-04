-- Migration: Update Approval Flows to Support Multiple Approvers Per Level
-- Date: 2025-11-04
-- Description: Changes approvers from flat array to JSONB structure for level grouping

-- =============================================
-- Update approval_flows table
-- =============================================

-- Step 1: Add new JSONB column for level-based approvers
ALTER TABLE approval_flows
ADD COLUMN IF NOT EXISTS levels JSONB;

-- Step 2: Migrate existing data from INTEGER[] to JSONB
-- Convert flat array [1,2,3] to [[1],[2],[3]] (one approver per level)
UPDATE approval_flows
SET levels = (
  SELECT jsonb_agg(jsonb_build_array(approver_id))
  FROM unnest(approvers) AS approver_id
)
WHERE levels IS NULL AND approvers IS NOT NULL;

-- Step 3: Set empty array for rows with no data
UPDATE approval_flows
SET levels = '[]'::jsonb
WHERE levels IS NULL;

-- Optional: Drop the old approvers column (keep for now for backward compatibility)
-- ALTER TABLE approval_flows DROP COLUMN IF EXISTS approvers;

-- Note: We're keeping both columns for now to maintain backward compatibility
-- 'levels' will be the primary field moving forward
-- 'approvers' can be dropped after verifying the migration works

-- =============================================
-- Example data structure:
-- levels: [[1, 2], [3], [4, 5, 6]]
-- This means:
--   Level 1: Users 1 and 2 (any one can approve)
--   Level 2: User 3 (must approve)
--   Level 3: Users 4, 5, and 6 (any one can approve)
-- =============================================

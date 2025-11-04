-- Migration: Update Approval Flows to Support Multiple Approvers Per Level
-- Date: 2025-11-04
-- Description: Changes approvers from flat array to JSONB structure for level grouping

-- =============================================
-- Update approval_flows table
-- =============================================

-- Step 1: Add new JSONB column for level-based approvers
ALTER TABLE approval_flows
ADD COLUMN IF NOT EXISTS approval_levels JSONB;

-- Step 2: Migrate existing data from INTEGER[] to JSONB
-- Convert flat array [1,2,3] to [[1],[2],[3]] (one approver per level)
UPDATE approval_flows
SET approval_levels = (
  SELECT jsonb_agg(jsonb_build_array(approver_id))
  FROM unnest(approvers) AS approver_id
)
WHERE approval_levels IS NULL AND approvers IS NOT NULL;

-- Step 3: Make approval_levels NOT NULL (after data migration)
ALTER TABLE approval_flows
ALTER COLUMN approval_levels SET NOT NULL;

-- Step 4: Drop the old approvers column (keep for now for backward compatibility)
-- ALTER TABLE approval_flows DROP COLUMN IF EXISTS approvers;

-- Note: We're keeping both columns for now to maintain backward compatibility
-- approval_levels will be the primary field moving forward
-- approvers will be kept as a flattened version for legacy support

-- =============================================
-- Add helper function to flatten approval_levels back to approvers
-- =============================================
CREATE OR REPLACE FUNCTION flatten_approval_levels(levels JSONB)
RETURNS INTEGER[] AS $$
DECLARE
  result INTEGER[] := ARRAY[]::INTEGER[];
  level_array JSONB;
BEGIN
  FOR level_array IN SELECT jsonb_array_elements(levels)
  LOOP
    result := result || ARRAY(SELECT jsonb_array_elements_text(level_array)::INTEGER);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =============================================
-- Trigger to auto-update approvers when approval_levels changes
-- =============================================
CREATE OR REPLACE FUNCTION sync_approval_levels_to_approvers()
RETURNS TRIGGER AS $$
BEGIN
  NEW.approvers := flatten_approval_levels(NEW.approval_levels);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_approval_levels ON approval_flows;
CREATE TRIGGER sync_approval_levels
  BEFORE INSERT OR UPDATE OF approval_levels ON approval_flows
  FOR EACH ROW
  EXECUTE FUNCTION sync_approval_levels_to_approvers();

-- =============================================
-- Example data structure:
-- approval_levels: [[1, 2], [3], [4, 5, 6]]
-- This means:
--   Level 1: Users 1 and 2 (any one can approve)
--   Level 2: User 3 (must approve)
--   Level 3: Users 4, 5, and 6 (any one can approve)
-- =============================================

-- Add approval workflow columns to projects table
-- These columns are needed for project submission and approval functionality

ALTER TABLE projects
ADD COLUMN IF NOT EXISTS submitted_by INTEGER REFERENCES users(id),
ADD COLUMN IF NOT EXISTS approved_by INTEGER REFERENCES users(id),
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Update status column to use approval workflow statuses
-- Old: active, on_hold, completed, cancelled
-- New: pending, approved, rejected (then active, on_hold, completed, cancelled after approval)

-- Create index for submitted_by for performance
CREATE INDEX IF NOT EXISTS idx_projects_submitted_by ON projects(submitted_by);
CREATE INDEX IF NOT EXISTS idx_projects_approved_by ON projects(approved_by);

-- Add comment
COMMENT ON COLUMN projects.submitted_by IS 'User who submitted the project for approval';
COMMENT ON COLUMN projects.approved_by IS 'User who approved or rejected the project';
COMMENT ON COLUMN projects.approved_at IS 'Timestamp when project was approved or rejected';
COMMENT ON COLUMN projects.rejection_reason IS 'Reason for rejection if project was rejected';

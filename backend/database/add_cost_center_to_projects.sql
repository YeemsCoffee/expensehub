-- Add cost_center_id to projects table for auto-generated project codes
-- Project codes will follow format: XXXXX-XXX
-- Where XXXXX is the cost center code and XXX is the sequential project number

ALTER TABLE projects
ADD COLUMN IF NOT EXISTS cost_center_id INTEGER REFERENCES cost_centers(id);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_projects_cost_center_id ON projects(cost_center_id);

-- Add comment
COMMENT ON COLUMN projects.cost_center_id IS 'Cost center for auto-generating project codes (format: XXXXX-XXX)';

-- Add current_phase_id to projects table
-- This tracks which phase a project is currently in

ALTER TABLE projects
ADD COLUMN IF NOT EXISTS current_phase_id INTEGER REFERENCES project_phases(id) ON DELETE SET NULL;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_projects_current_phase ON projects(current_phase_id);

-- Add comment
COMMENT ON COLUMN projects.current_phase_id IS 'The current active phase for this project';

-- Optional: Set the current phase to the first active or in_progress phase for existing projects
UPDATE projects p
SET current_phase_id = (
    SELECT pp.id
    FROM project_phases pp
    WHERE pp.project_id = p.id
      AND pp.is_active = true
      AND pp.status IN ('active', 'in_progress')
    ORDER BY pp.sequence_order
    LIMIT 1
)
WHERE p.current_phase_id IS NULL;

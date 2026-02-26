-- Add WBS (Work Breakdown Structure) Elements table
-- Similar to SAP WBS elements for project budget breakdown

CREATE TABLE IF NOT EXISTS project_wbs_elements (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    code VARCHAR(50) UNIQUE NOT NULL,
    category VARCHAR(100) NOT NULL,
    description TEXT,
    budget_estimate DECIMAL(12, 2) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_budget CHECK (budget_estimate >= 0)
);

-- Add WBS element reference to expenses table
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS wbs_element_id INTEGER REFERENCES project_wbs_elements(id);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_wbs_elements_project_id ON project_wbs_elements(project_id);
CREATE INDEX IF NOT EXISTS idx_wbs_elements_code ON project_wbs_elements(code);
CREATE INDEX IF NOT EXISTS idx_expenses_wbs_element_id ON expenses(wbs_element_id);

-- Add comments for documentation
COMMENT ON TABLE project_wbs_elements IS 'Work Breakdown Structure elements for project budget breakdown (similar to SAP WBS)';
COMMENT ON COLUMN project_wbs_elements.code IS 'WBS element code (e.g., 10001-001-01). Format: {project_code}-{category_suffix}';
COMMENT ON COLUMN project_wbs_elements.category IS 'Budget category (e.g., Construction, Material, Engineering Studies)';
COMMENT ON COLUMN project_wbs_elements.budget_estimate IS 'Estimated budget for this WBS element/category';
COMMENT ON COLUMN expenses.wbs_element_id IS 'Link to specific WBS element for detailed project budget tracking';

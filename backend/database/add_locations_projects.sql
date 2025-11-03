-- Add Locations table
CREATE TABLE locations (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(50),
    country VARCHAR(100) DEFAULT 'USA',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add Projects/Initiatives table
CREATE TABLE projects (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    start_date DATE,
    end_date DATE,
    budget DECIMAL(12, 2),
    status VARCHAR(50) DEFAULT 'active', -- active, on_hold, completed, cancelled
    project_manager VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Enhance expenses table with new dimensions
ALTER TABLE expenses ADD COLUMN location_id INTEGER REFERENCES locations(id);
ALTER TABLE expenses ADD COLUMN project_id INTEGER REFERENCES projects(id);
ALTER TABLE expenses ADD COLUMN cost_type VARCHAR(50) DEFAULT 'OPEX'; -- OPEX, CAPEX
ALTER TABLE expenses ADD COLUMN payment_method VARCHAR(50); -- Credit Card, Cash, Check, Wire Transfer
ALTER TABLE expenses ADD COLUMN vendor_name VARCHAR(255);
ALTER TABLE expenses ADD COLUMN gl_account VARCHAR(50); -- General Ledger account code
ALTER TABLE expenses ADD COLUMN notes TEXT;
ALTER TABLE expenses ADD COLUMN is_reimbursable BOOLEAN DEFAULT false;

-- Create indexes for better performance
CREATE INDEX idx_expenses_location_id ON expenses(location_id);
CREATE INDEX idx_expenses_project_id ON expenses(project_id);
CREATE INDEX idx_expenses_cost_type ON expenses(cost_type);
CREATE INDEX idx_locations_code ON locations(code);
CREATE INDEX idx_projects_code ON projects(code);
CREATE INDEX idx_projects_status ON projects(status);

-- Add comments
COMMENT ON TABLE locations IS 'Physical locations/stores/offices for expense tracking';
COMMENT ON TABLE projects IS 'Projects and initiatives for expense allocation';
COMMENT ON COLUMN expenses.cost_type IS 'OPEX (Operating Expense) or CAPEX (Capital Expenditure)';
COMMENT ON COLUMN expenses.is_reimbursable IS 'Whether this expense should be reimbursed to employee';
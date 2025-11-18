-- Migration: Seed Default Cost Centers and Locations
-- Purpose: Add default cost centers and locations if tables are empty

-- Insert default cost centers (only if none exist)
INSERT INTO cost_centers (code, name, budget, department, is_active)
SELECT * FROM (VALUES
  ('CC001', 'General Operations', 100000.00, 'Operations', true),
  ('CC002', 'Marketing', 50000.00, 'Marketing', true),
  ('CC003', 'IT Infrastructure', 75000.00, 'IT', true),
  ('CC004', 'Human Resources', 40000.00, 'HR', true),
  ('CC005', 'Research & Development', 120000.00, 'R&D', true),
  ('CC006', 'Sales', 60000.00, 'Sales', true)
) AS v(code, name, budget, department, is_active)
WHERE NOT EXISTS (SELECT 1 FROM cost_centers LIMIT 1);

-- Insert default locations (only if none exist)
INSERT INTO locations (code, name, address, city, state, zip_code, country, is_active)
SELECT * FROM (VALUES
  ('HQ', 'Headquarters', '123 Main Street', 'Seattle', 'WA', '98101', 'USA', true),
  ('NY', 'New York Office', '456 Broadway', 'New York', 'NY', '10012', 'USA', true),
  ('SF', 'San Francisco Office', '789 Market Street', 'San Francisco', 'CA', '94102', 'USA', true)
) AS v(code, name, address, city, state, zip_code, country, is_active)
WHERE NOT EXISTS (SELECT 1 FROM locations LIMIT 1);

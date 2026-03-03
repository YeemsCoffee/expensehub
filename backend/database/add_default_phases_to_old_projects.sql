-- Add default phases to old projects that don't have any phases yet
-- This ensures all projects have a basic phase structure

-- Create a temporary function to add default phases to a project
CREATE OR REPLACE FUNCTION add_default_phases_to_project(project_id_param INTEGER)
RETURNS VOID AS $$
DECLARE
    phase_planning_id INTEGER;
BEGIN
    -- Insert default phases for the project
    -- Phase 1: Planning
    INSERT INTO project_phases (
        project_id, name, description, sequence_order, status,
        gate_approval_required, is_active
    )
    VALUES (
        project_id_param,
        'Planning',
        'Initial project planning and requirements gathering',
        1,
        'in_progress',
        true,
        true
    )
    RETURNING id INTO phase_planning_id;

    -- Phase 2: Execution
    INSERT INTO project_phases (
        project_id, name, description, sequence_order, status,
        gate_approval_required, is_active
    )
    VALUES (
        project_id_param,
        'Execution',
        'Project implementation and development',
        2,
        'not_started',
        true,
        true
    );

    -- Phase 3: Monitoring
    INSERT INTO project_phases (
        project_id, name, description, sequence_order, status,
        gate_approval_required, is_active
    )
    VALUES (
        project_id_param,
        'Monitoring',
        'Project monitoring and control',
        3,
        'not_started',
        false,
        true
    );

    -- Phase 4: Closure
    INSERT INTO project_phases (
        project_id, name, description, sequence_order, status,
        gate_approval_required, is_active
    )
    VALUES (
        project_id_param,
        'Closure',
        'Project closure and final deliverables',
        4,
        'not_started',
        true,
        true
    );

    -- Set the current phase to Planning (the first phase)
    UPDATE projects
    SET current_phase_id = phase_planning_id
    WHERE id = project_id_param;

END;
$$ LANGUAGE plpgsql;

-- Add default phases to all projects that don't have any phases yet
DO $$
DECLARE
    project_record RECORD;
    phase_count INTEGER;
BEGIN
    FOR project_record IN
        SELECT id FROM projects
        WHERE status IN ('approved', 'in_progress', 'planning')
    LOOP
        -- Check if this project has any phases
        SELECT COUNT(*) INTO phase_count
        FROM project_phases
        WHERE project_id = project_record.id;

        -- If no phases exist, create default phases
        IF phase_count = 0 THEN
            PERFORM add_default_phases_to_project(project_record.id);
            RAISE NOTICE 'Added default phases to project %', project_record.id;
        END IF;
    END LOOP;
END $$;

-- Clean up the temporary function
DROP FUNCTION IF EXISTS add_default_phases_to_project(INTEGER);

-- Ensure all approved projects have a current phase set
UPDATE projects p
SET current_phase_id = (
    SELECT pp.id
    FROM project_phases pp
    WHERE pp.project_id = p.id
      AND pp.is_active = true
    ORDER BY pp.sequence_order
    LIMIT 1
)
WHERE p.current_phase_id IS NULL
  AND p.status IN ('approved', 'in_progress', 'planning')
  AND EXISTS (
    SELECT 1 FROM project_phases pp2
    WHERE pp2.project_id = p.id
  );

-- Verify the results
SELECT
    p.id,
    p.name as project_name,
    p.status as project_status,
    COUNT(pp.id) as phase_count,
    p.current_phase_id,
    cp.name as current_phase_name
FROM projects p
LEFT JOIN project_phases pp ON pp.project_id = p.id
LEFT JOIN project_phases cp ON cp.id = p.current_phase_id
WHERE p.status IN ('approved', 'in_progress', 'planning')
GROUP BY p.id, p.name, p.status, p.current_phase_id, cp.name
ORDER BY p.id;

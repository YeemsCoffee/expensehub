const express = require('express');
const router = express.Router();
const { authMiddleware, isManagerOrAdmin } = require('../middleware/auth');
const { auditLog } = require('../middleware/auditLog');
const db = require('../config/database');

// ============================================================================
// PROJECT PHASES & MILESTONES ROUTES
// ============================================================================

// -----------------------------------------------------------------------------
// PHASES
// -----------------------------------------------------------------------------

/**
 * GET /api/project-phases/:projectId
 * Get all phases for a project
 */
router.get('/:projectId', authMiddleware, auditLog('VIEW_PROJECT_PHASES'), async (req, res) => {
  try {
    const { projectId } = req.params;

    const result = await db.query(
      `SELECT pp.*,
              u.first_name || ' ' || u.last_name as approved_by_name
       FROM project_phases pp
       LEFT JOIN users u ON pp.gate_approved_by = u.id
       WHERE pp.project_id = $1 AND pp.is_active = true
       ORDER BY pp.sequence_order`,
      [projectId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching project phases:', err);
    res.status(500).json({ error: 'Failed to fetch project phases' });
  }
});

/**
 * POST /api/project-phases
 * Create a new project phase
 */
router.post('/', authMiddleware, isManagerOrAdmin, auditLog('CREATE_PROJECT_PHASE'), async (req, res) => {
  const client = await db.pool.connect();
  try {
    const {
      project_id,
      name,
      description,
      sequence_order,
      planned_start_date,
      planned_end_date,
      budget_allocation,
      gate_approval_required
    } = req.body;

    // Validation
    if (!project_id || !name || !sequence_order) {
      return res.status(400).json({ error: 'Project ID, name, and sequence order are required' });
    }

    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO project_phases
       (project_id, name, description, sequence_order, planned_start_date,
        planned_end_date, budget_allocation, gate_approval_required)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [project_id, name, description, sequence_order, planned_start_date,
       planned_end_date, budget_allocation, gate_approval_required]
    );

    await client.query('COMMIT');

    // Attach to request for audit logging
    req.auditData = { phase: result.rows[0] };

    res.status(201).json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error creating project phase:', err);
    res.status(500).json({ error: 'Failed to create project phase' });
  } finally {
    client.release();
  }
});

/**
 * PUT /api/project-phases/:id
 * Update a project phase
 */
router.put('/:id', authMiddleware, isManagerOrAdmin, auditLog('UPDATE_PROJECT_PHASE'), async (req, res) => {
  const client = await db.pool.connect();
  try {
    const { id } = req.params;
    const {
      name,
      description,
      status,
      actual_start_date,
      actual_end_date,
      gate_decision,
      gate_notes
    } = req.body;

    await client.query('BEGIN');

    // Get old values for audit
    const oldData = await client.query(
      'SELECT * FROM project_phases WHERE id = $1',
      [id]
    );

    const result = await client.query(
      `UPDATE project_phases
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           status = COALESCE($3, status),
           actual_start_date = COALESCE($4, actual_start_date),
           actual_end_date = COALESCE($5, actual_end_date),
           gate_decision = COALESCE($6, gate_decision),
           gate_notes = COALESCE($7, gate_notes),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $8
       RETURNING *`,
      [name, description, status, actual_start_date, actual_end_date, gate_decision, gate_notes, id]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Phase not found' });
    }

    await client.query('COMMIT');

    // Attach to request for audit logging
    req.auditData = {
      oldPhase: oldData.rows[0],
      newPhase: result.rows[0]
    };

    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error updating project phase:', err);
    res.status(500).json({ error: 'Failed to update project phase' });
  } finally {
    client.release();
  }
});

/**
 * POST /api/project-phases/:id/approve-gate
 * Approve a phase gate (Go/No-Go decision)
 */
router.post('/:id/approve-gate', authMiddleware, isManagerOrAdmin, auditLog('APPROVE_PHASE_GATE'), async (req, res) => {
  const client = await db.pool.connect();
  try {
    const { id } = req.params;
    const { decision, notes } = req.body; // decision: approved, rejected, conditional

    if (!decision || !['approved', 'rejected', 'conditional'].includes(decision)) {
      return res.status(400).json({ error: 'Valid decision required (approved, rejected, conditional)' });
    }

    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE project_phases
       SET gate_approved_by = $1,
           gate_approved_at = CURRENT_TIMESTAMP,
           gate_decision = $2,
           gate_notes = $3,
           status = CASE WHEN $2 = 'approved' THEN 'in_progress' ELSE status END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING *`,
      [req.user.id, decision, notes, id]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Phase not found' });
    }

    await client.query('COMMIT');

    req.auditData = {
      phase: result.rows[0],
      decision,
      notes
    };

    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error approving phase gate:', err);
    res.status(500).json({ error: 'Failed to approve phase gate' });
  } finally {
    client.release();
  }
});

// -----------------------------------------------------------------------------
// MILESTONES
// -----------------------------------------------------------------------------

/**
 * GET /api/project-phases/milestones/:projectId
 * Get all milestones for a project
 */
router.get('/milestones/:projectId', authMiddleware, auditLog('VIEW_PROJECT_MILESTONES'), async (req, res) => {
  try {
    const { projectId } = req.params;

    const result = await db.query(
      `SELECT pm.*,
              pp.name as phase_name,
              u.first_name || ' ' || u.last_name as achieved_by_name
       FROM project_milestones pm
       LEFT JOIN project_phases pp ON pm.phase_id = pp.id
       LEFT JOIN users u ON pm.achieved_by = u.id
       WHERE pm.project_id = $1 AND pm.is_active = true
       ORDER BY pm.planned_date`,
      [projectId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching project milestones:', err);
    res.status(500).json({ error: 'Failed to fetch project milestones' });
  }
});

/**
 * POST /api/project-phases/milestones
 * Create a new milestone
 */
router.post('/milestones', authMiddleware, isManagerOrAdmin, auditLog('CREATE_MILESTONE'), async (req, res) => {
  const client = await db.pool.connect();
  try {
    const {
      project_id,
      phase_id,
      name,
      description,
      milestone_type,
      planned_date,
      is_critical_path
    } = req.body;

    if (!project_id || !name || !planned_date) {
      return res.status(400).json({ error: 'Project ID, name, and planned date are required' });
    }

    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO project_milestones
       (project_id, phase_id, name, description, milestone_type, planned_date, is_critical_path)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [project_id, phase_id, name, description, milestone_type, planned_date, is_critical_path]
    );

    await client.query('COMMIT');

    req.auditData = { milestone: result.rows[0] };

    res.status(201).json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error creating milestone:', err);
    res.status(500).json({ error: 'Failed to create milestone' });
  } finally {
    client.release();
  }
});

/**
 * PUT /api/project-phases/milestones/:id
 * Update a milestone
 */
router.put('/milestones/:id', authMiddleware, isManagerOrAdmin, auditLog('UPDATE_MILESTONE'), async (req, res) => {
  const client = await db.pool.connect();
  try {
    const { id } = req.params;
    const {
      name,
      actual_date,
      status,
      completion_percentage,
      notes
    } = req.body;

    await client.query('BEGIN');

    // Get old values
    const oldData = await client.query(
      'SELECT * FROM project_milestones WHERE id = $1',
      [id]
    );

    const result = await client.query(
      `UPDATE project_milestones
       SET name = COALESCE($1, name),
           actual_date = COALESCE($2, actual_date),
           status = COALESCE($3, status),
           completion_percentage = COALESCE($4, completion_percentage),
           notes = COALESCE($5, notes),
           achieved_by = CASE WHEN $3 = 'achieved' THEN $6 ELSE achieved_by END,
           achieved_at = CASE WHEN $3 = 'achieved' THEN CURRENT_TIMESTAMP ELSE achieved_at END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7
       RETURNING *`,
      [name, actual_date, status, completion_percentage, notes, req.user.id, id]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Milestone not found' });
    }

    await client.query('COMMIT');

    req.auditData = {
      oldMilestone: oldData.rows[0],
      newMilestone: result.rows[0]
    };

    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error updating milestone:', err);
    res.status(500).json({ error: 'Failed to update milestone' });
  } finally {
    client.release();
  }
});

/**
 * DELETE /api/project-phases/milestones/:id
 * Soft delete a milestone
 */
router.delete('/milestones/:id', authMiddleware, isManagerOrAdmin, auditLog('DELETE_MILESTONE'), async (req, res) => {
  const client = await db.pool.connect();
  try {
    const { id } = req.params;

    await client.query('BEGIN');

    const result = await client.query(
      'UPDATE project_milestones SET is_active = false WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Milestone not found' });
    }

    await client.query('COMMIT');

    req.auditData = { milestone: result.rows[0] };

    res.json({ message: 'Milestone deleted successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error deleting milestone:', err);
    res.status(500).json({ error: 'Failed to delete milestone' });
  } finally {
    client.release();
  }
});

/**
 * POST /api/project-phases/:projectId/set-current/:phaseId
 * Set the current phase for a project
 */
router.post('/:projectId/set-current/:phaseId', authMiddleware, isManagerOrAdmin, auditLog('SET_CURRENT_PHASE'), async (req, res) => {
  const client = await db.pool.connect();
  try {
    const { projectId, phaseId } = req.params;

    await client.query('BEGIN');

    // Verify phase belongs to project
    const phaseCheck = await client.query(
      'SELECT id, name FROM project_phases WHERE id = $1 AND project_id = $2 AND is_active = true',
      [phaseId, projectId]
    );

    if (phaseCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Phase not found for this project' });
    }

    // Update project's current phase
    const result = await client.query(
      'UPDATE projects SET current_phase_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [phaseId, projectId]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Project not found' });
    }

    await client.query('COMMIT');

    req.auditData = {
      project: result.rows[0],
      phase: phaseCheck.rows[0],
      action: 'set_current_phase'
    };

    res.json({
      message: 'Current phase updated successfully',
      project: result.rows[0],
      phase: phaseCheck.rows[0]
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error setting current phase:', err);
    res.status(500).json({ error: 'Failed to set current phase' });
  } finally {
    client.release();
  }
});

/**
 * POST /api/project-phases/admin/initialize-phases
 * Initialize default phases for projects that don't have any
 * (Admin/Developer only)
 */
router.post('/admin/initialize-phases', authMiddleware, async (req, res) => {
  const client = await db.pool.connect();
  try {
    // Check if user is admin or developer
    const userResult = await client.query(
      'SELECT role FROM users WHERE id = $1',
      [req.user.id]
    );

    if (!userResult.rows[0] || !['admin', 'developer'].includes(userResult.rows[0].role)) {
      return res.status(403).json({ error: 'Unauthorized. Admin or Developer role required.' });
    }

    await client.query('BEGIN');

    // Find all approved/in_progress projects without phases
    const projectsResult = await client.query(`
      SELECT p.id, p.name, p.status
      FROM projects p
      WHERE p.status IN ('approved', 'in_progress', 'planning')
        AND NOT EXISTS (
          SELECT 1 FROM project_phases pp WHERE pp.project_id = p.id
        )
      ORDER BY p.id
    `);

    const projectsToInitialize = projectsResult.rows;
    const initializedProjects = [];

    for (const project of projectsToInitialize) {
      // Create default phases for this project
      const phases = [
        { name: 'Conceptual', description: 'Initial concept development and ideation', sequence: 1, status: 'in_progress', gate: true },
        { name: 'Feasibility', description: 'Feasibility study and requirements gathering', sequence: 2, status: 'not_started', gate: true },
        { name: 'Execution', description: 'Project implementation and development', sequence: 3, status: 'not_started', gate: true },
        { name: 'Closeout', description: 'Project closure and final deliverables', sequence: 4, status: 'not_started', gate: true }
      ];

      let planningPhaseId = null;

      for (const phase of phases) {
        const phaseResult = await client.query(`
          INSERT INTO project_phases (
            project_id, name, description, sequence_order, status,
            gate_approval_required, is_active
          )
          VALUES ($1, $2, $3, $4, $5, $6, true)
          RETURNING id
        `, [project.id, phase.name, phase.description, phase.sequence, phase.status, phase.gate]);

        if (phase.sequence === 1) {
          planningPhaseId = phaseResult.rows[0].id;
        }
      }

      // Set the current phase to Conceptual
      await client.query(
        'UPDATE projects SET current_phase_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [planningPhaseId, project.id]
      );

      initializedProjects.push({
        id: project.id,
        name: project.name,
        status: project.status
      });
    }

    await client.query('COMMIT');

    res.json({
      message: `Successfully initialized phases for ${initializedProjects.length} project(s)`,
      projects: initializedProjects
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error initializing project phases:', err);
    res.status(500).json({ error: 'Failed to initialize project phases', details: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;

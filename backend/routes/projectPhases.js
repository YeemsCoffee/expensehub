const express = require('express');
const router = express.Router();
const { auth, requireManager } = require('../middleware/auth');
const { auditLog } = require('../middleware/auditLog');
const pool = require('../db');

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
router.get('/:projectId', auth, auditLog('VIEW_PROJECT_PHASES'), async (req, res) => {
  try {
    const { projectId } = req.params;

    const result = await pool.query(
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
router.post('/', auth, requireManager, auditLog('CREATE_PROJECT_PHASE'), async (req, res) => {
  const client = await pool.connect();
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
router.put('/:id', auth, requireManager, auditLog('UPDATE_PROJECT_PHASE'), async (req, res) => {
  const client = await pool.connect();
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
router.post('/:id/approve-gate', auth, requireManager, auditLog('APPROVE_PHASE_GATE'), async (req, res) => {
  const client = await pool.connect();
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
router.get('/milestones/:projectId', auth, auditLog('VIEW_PROJECT_MILESTONES'), async (req, res) => {
  try {
    const { projectId } = req.params;

    const result = await pool.query(
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
router.post('/milestones', auth, requireManager, auditLog('CREATE_MILESTONE'), async (req, res) => {
  const client = await pool.connect();
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
router.put('/milestones/:id', auth, requireManager, auditLog('UPDATE_MILESTONE'), async (req, res) => {
  const client = await pool.connect();
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
router.delete('/milestones/:id', auth, requireManager, auditLog('DELETE_MILESTONE'), async (req, res) => {
  const client = await pool.connect();
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

module.exports = router;

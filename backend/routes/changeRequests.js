const express = require('express');
const router = express.Router();
const { auth, requireManager } = require('../middleware/auth');
const { auditLog } = require('../middleware/auditLog');
const pool = require('../db');

// ============================================================================
// CHANGE REQUEST MANAGEMENT ROUTES
// ============================================================================

/**
 * GET /api/change-requests/project/:projectId
 * Get all change requests for a project
 */
router.get('/project/:projectId', auth, auditLog('VIEW_CHANGE_REQUESTS'), async (req, res) => {
  try {
    const { projectId } = req.params;

    const result = await pool.query(
      `SELECT cr.*,
              u1.first_name || ' ' || u1.last_name as requested_by_name,
              u2.first_name || ' ' || u2.last_name as reviewed_by_name,
              u3.first_name || ' ' || u3.last_name as approved_by_name,
              p.name as project_name,
              p.code as project_code
       FROM project_change_requests cr
       LEFT JOIN users u1 ON cr.requested_by = u1.id
       LEFT JOIN users u2 ON cr.reviewed_by = u2.id
       LEFT JOIN users u3 ON cr.approved_by = u3.id
       LEFT JOIN projects p ON cr.project_id = p.id
       WHERE cr.project_id = $1 AND cr.is_active = true
       ORDER BY cr.requested_date DESC, cr.created_at DESC`,
      [projectId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching change requests:', err);
    res.status(500).json({ error: 'Failed to fetch change requests' });
  }
});

/**
 * GET /api/change-requests/:id
 * Get a specific change request with approvals
 */
router.get('/:id', auth, auditLog('VIEW_CHANGE_REQUEST'), async (req, res) => {
  try {
    const { id } = req.params;

    // Get change request
    const crResult = await pool.query(
      `SELECT cr.*,
              u1.first_name || ' ' || u1.last_name as requested_by_name,
              u2.first_name || ' ' || u2.last_name as reviewed_by_name,
              u3.first_name || ' ' || u3.last_name as approved_by_name,
              p.name as project_name,
              p.code as project_code
       FROM project_change_requests cr
       LEFT JOIN users u1 ON cr.requested_by = u1.id
       LEFT JOIN users u2 ON cr.reviewed_by = u2.id
       LEFT JOIN users u3 ON cr.approved_by = u3.id
       LEFT JOIN projects p ON cr.project_id = p.id
       WHERE cr.id = $1`,
      [id]
    );

    if (crResult.rows.length === 0) {
      return res.status(404).json({ error: 'Change request not found' });
    }

    // Get approvals
    const approvalsResult = await pool.query(
      `SELECT cra.*,
              u.first_name || ' ' || u.last_name as approver_name,
              u.email as approver_email
       FROM change_request_approvals cra
       LEFT JOIN users u ON cra.approver_id = u.id
       WHERE cra.change_request_id = $1
       ORDER BY cra.approval_level`,
      [id]
    );

    const changeRequest = crResult.rows[0];
    changeRequest.approvals = approvalsResult.rows;

    res.json(changeRequest);
  } catch (err) {
    console.error('Error fetching change request:', err);
    res.status(500).json({ error: 'Failed to fetch change request' });
  }
});

/**
 * POST /api/change-requests
 * Create a new change request
 */
router.post('/', auth, auditLog('CREATE_CHANGE_REQUEST'), async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      project_id,
      title,
      description,
      change_type,
      change_category,
      impact_scope,
      impact_schedule,
      impact_budget,
      impact_resources,
      impact_quality,
      impact_risk,
      estimated_cost,
      cost_benefit_analysis,
      priority,
      approvers // Array of {approver_id, approval_level}
    } = req.body;

    // Validation
    if (!project_id || !title || !description || !change_type) {
      return res.status(400).json({
        error: 'Project ID, title, description, and change type are required'
      });
    }

    await client.query('BEGIN');

    // Generate change number
    const countResult = await client.query(
      'SELECT COUNT(*) FROM project_change_requests WHERE project_id = $1',
      [project_id]
    );
    const count = parseInt(countResult.rows[0].count) + 1;
    const change_number = `CR-${String(count).padStart(3, '0')}`;

    // Create change request
    const crResult = await client.query(
      `INSERT INTO project_change_requests
       (project_id, change_number, title, description, change_type, change_category,
        requested_by, requested_date, impact_scope, impact_schedule, impact_budget,
        impact_resources, impact_quality, impact_risk, estimated_cost,
        cost_benefit_analysis, priority, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_DATE, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'submitted')
       RETURNING *`,
      [project_id, change_number, title, description, change_type, change_category,
       req.user.id, impact_scope, impact_schedule, impact_budget || 0,
       impact_resources, impact_quality, impact_risk, estimated_cost || 0,
       cost_benefit_analysis, priority || 'medium']
    );

    const changeRequest = crResult.rows[0];

    // Create approval workflow if approvers provided
    if (approvers && Array.isArray(approvers) && approvers.length > 0) {
      for (const approver of approvers) {
        await client.query(
          `INSERT INTO change_request_approvals
           (change_request_id, approver_id, approval_level, is_required)
           VALUES ($1, $2, $3, $4)`,
          [changeRequest.id, approver.approver_id, approver.approval_level, approver.is_required !== false]
        );
      }
    }

    await client.query('COMMIT');

    req.auditData = { changeRequest };

    res.status(201).json(changeRequest);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error creating change request:', err);
    res.status(500).json({ error: 'Failed to create change request' });
  } finally {
    client.release();
  }
});

/**
 * PUT /api/change-requests/:id
 * Update a change request
 */
router.put('/:id', auth, auditLog('UPDATE_CHANGE_REQUEST'), async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const {
      title,
      description,
      impact_scope,
      impact_schedule,
      impact_budget,
      impact_resources,
      impact_quality,
      impact_risk,
      estimated_cost,
      cost_benefit_analysis,
      priority
    } = req.body;

    await client.query('BEGIN');

    // Get old values
    const oldData = await client.query(
      'SELECT * FROM project_change_requests WHERE id = $1',
      [id]
    );

    if (oldData.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Change request not found' });
    }

    // Only allow updates if not approved/implemented
    if (['approved', 'implemented'].includes(oldData.rows[0].status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'Cannot update approved or implemented change requests'
      });
    }

    const result = await client.query(
      `UPDATE project_change_requests
       SET title = COALESCE($1, title),
           description = COALESCE($2, description),
           impact_scope = COALESCE($3, impact_scope),
           impact_schedule = COALESCE($4, impact_schedule),
           impact_budget = COALESCE($5, impact_budget),
           impact_resources = COALESCE($6, impact_resources),
           impact_quality = COALESCE($7, impact_quality),
           impact_risk = COALESCE($8, impact_risk),
           estimated_cost = COALESCE($9, estimated_cost),
           cost_benefit_analysis = COALESCE($10, cost_benefit_analysis),
           priority = COALESCE($11, priority),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $12
       RETURNING *`,
      [title, description, impact_scope, impact_schedule, impact_budget,
       impact_resources, impact_quality, impact_risk, estimated_cost,
       cost_benefit_analysis, priority, id]
    );

    await client.query('COMMIT');

    req.auditData = {
      oldChangeRequest: oldData.rows[0],
      newChangeRequest: result.rows[0]
    };

    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error updating change request:', err);
    res.status(500).json({ error: 'Failed to update change request' });
  } finally {
    client.release();
  }
});

/**
 * POST /api/change-requests/:id/review
 * Review a change request (Manager)
 */
router.post('/:id/review', auth, requireManager, auditLog('REVIEW_CHANGE_REQUEST'), async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { decision, comments } = req.body; // decision: approved, rejected

    if (!decision || !['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ error: 'Valid decision required (approved or rejected)' });
    }

    await client.query('BEGIN');

    const newStatus = decision === 'approved' ? 'approved' : 'rejected';
    const rejection_reason = decision === 'rejected' ? comments : null;

    const result = await client.query(
      `UPDATE project_change_requests
       SET status = $1,
           reviewed_by = $2,
           reviewed_at = CURRENT_TIMESTAMP,
           approved_by = CASE WHEN $1 = 'approved' THEN $2 ELSE approved_by END,
           approved_at = CASE WHEN $1 = 'approved' THEN CURRENT_TIMESTAMP ELSE approved_at END,
           rejection_reason = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING *`,
      [newStatus, req.user.id, rejection_reason, id]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Change request not found' });
    }

    await client.query('COMMIT');

    req.auditData = {
      changeRequest: result.rows[0],
      decision,
      comments
    };

    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error reviewing change request:', err);
    res.status(500).json({ error: 'Failed to review change request' });
  } finally {
    client.release();
  }
});

/**
 * POST /api/change-requests/:id/approve
 * Approve at specific level (Multi-level approval)
 */
router.post('/:id/approve', auth, requireManager, auditLog('APPROVE_CHANGE_REQUEST_LEVEL'), async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { approval_level, comments } = req.body;

    if (!approval_level) {
      return res.status(400).json({ error: 'Approval level is required' });
    }

    await client.query('BEGIN');

    // Check if approver is authorized for this level
    const approvalCheck = await client.query(
      `SELECT * FROM change_request_approvals
       WHERE change_request_id = $1 AND approver_id = $2 AND approval_level = $3`,
      [id, req.user.id, approval_level]
    );

    if (approvalCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Not authorized to approve at this level' });
    }

    // Update approval record
    await client.query(
      `UPDATE change_request_approvals
       SET approval_status = 'approved',
           approval_date = CURRENT_TIMESTAMP,
           comments = $1
       WHERE change_request_id = $2 AND approver_id = $3 AND approval_level = $4`,
      [comments, id, req.user.id, approval_level]
    );

    // Check if all required approvals are complete
    const allApprovals = await client.query(
      `SELECT * FROM change_request_approvals
       WHERE change_request_id = $1 AND is_required = true`,
      [id]
    );

    const allApproved = allApprovals.rows.every(a => a.approval_status === 'approved');

    // Update change request status if all approved
    if (allApproved) {
      await client.query(
        `UPDATE project_change_requests
         SET status = 'approved',
             approved_by = $1,
             approved_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [req.user.id, id]
      );
    }

    await client.query('COMMIT');

    req.auditData = {
      change_request_id: id,
      approval_level,
      all_approved: allApproved
    };

    res.json({ message: 'Approval recorded', all_approved: allApproved });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error approving change request:', err);
    res.status(500).json({ error: 'Failed to approve change request' });
  } finally {
    client.release();
  }
});

/**
 * POST /api/change-requests/:id/implement
 * Mark change request as implemented
 */
router.post('/:id/implement', auth, requireManager, auditLog('IMPLEMENT_CHANGE_REQUEST'), async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { implementation_notes } = req.body;

    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE project_change_requests
       SET status = 'implemented',
           implementation_date = CURRENT_DATE,
           implemented_by = $1,
           implementation_notes = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 AND status = 'approved'
       RETURNING *`,
      [req.user.id, implementation_notes, id]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'Change request not found or not in approved status'
      });
    }

    // Apply budget change if applicable
    if (result.rows[0].impact_budget && result.rows[0].impact_budget !== 0) {
      await client.query(
        `UPDATE projects
         SET budget = budget + $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [result.rows[0].impact_budget, result.rows[0].project_id]
      );
    }

    await client.query('COMMIT');

    req.auditData = { changeRequest: result.rows[0] };

    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error implementing change request:', err);
    res.status(500).json({ error: 'Failed to implement change request' });
  } finally {
    client.release();
  }
});

module.exports = router;

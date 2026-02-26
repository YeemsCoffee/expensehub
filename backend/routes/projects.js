const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authMiddleware, isManagerOrAdmin } = require('../middleware/auth');

// Submit new project (all authenticated users)
router.post('/submit', authMiddleware, [
  body('costCenterId').notEmpty().isInt(),
  body('name').notEmpty().trim(),
  body('description').notEmpty().trim(),
  body('startDate').optional().isISO8601(),
  body('endDate').optional().isISO8601(),
  body('budget').optional().isFloat({ min: 0 }),
  body('projectManager').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { costCenterId, name, description, startDate, endDate, budget, projectManager } = req.body;

    // Get cost center code
    const ccResult = await db.query(
      'SELECT code FROM cost_centers WHERE id = $1 AND is_active = true',
      [costCenterId]
    );

    if (ccResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or inactive cost center' });
    }

    const costCenterCode = ccResult.rows[0].code;

    // Get next sequential project number (across all projects)
    const countResult = await db.query('SELECT COUNT(*) as count FROM projects');
    const nextProjectNumber = (parseInt(countResult.rows[0].count) + 1).toString().padStart(3, '0');

    // Generate project code: XXXXX-XXX (cost center code - sequential number)
    const generatedCode = `${costCenterCode}-${nextProjectNumber}`;

    // Create project with pending status
    const result = await db.query(
      `INSERT INTO projects (
        code, name, description, start_date, end_date, budget,
        status, project_manager, submitted_by, cost_center_id, is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, $9, true)
      RETURNING id, code, name, description, start_date, end_date, budget, status, project_manager, submitted_by, cost_center_id, created_at`,
      [generatedCode, name, description, startDate, endDate, budget, projectManager, req.user.id, costCenterId]
    );

    res.status(201).json({
      message: 'Project submitted for approval',
      project: result.rows[0]
    });
  } catch (error) {
    console.error('Submit project error:', error);
    res.status(500).json({ error: 'Server error submitting project' });
  }
});

// Get my submitted projects
router.get('/my-submissions', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, code, name, description, start_date, end_date, budget, 
              status, project_manager, rejection_reason, created_at, updated_at
       FROM projects 
       WHERE submitted_by = $1
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Fetch my submissions error:', error);
    res.status(500).json({ error: 'Server error fetching submissions' });
  }
});

// Get pending projects (manager/admin only)
router.get('/pending', authMiddleware, isManagerOrAdmin, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT p.id, p.code, p.name, p.description, p.start_date, p.end_date, 
              p.budget, p.status, p.project_manager, p.created_at,
              u.first_name || ' ' || u.last_name as submitted_by_name,
              u.email as submitted_by_email
       FROM projects p
       JOIN users u ON p.submitted_by = u.id
       WHERE p.status = 'pending'
       ORDER BY p.created_at DESC`
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Fetch pending projects error:', error);
    res.status(500).json({ error: 'Server error fetching pending projects' });
  }
});

// Approve project (manager/admin only)
router.post('/:id/approve', authMiddleware, isManagerOrAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if project exists and is pending
    const checkResult = await db.query(
      'SELECT id, status FROM projects WHERE id = $1',
      [id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (checkResult.rows[0].status !== 'pending') {
      return res.status(400).json({ error: 'Project is not pending approval' });
    }

    // Approve project
    const result = await db.query(
      `UPDATE projects 
       SET status = 'approved',
           approved_by = $1,
           approved_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [req.user.id, id]
    );

    res.json({
      message: 'Project approved successfully',
      project: result.rows[0]
    });
  } catch (error) {
    console.error('Approve project error:', error);
    res.status(500).json({ error: 'Server error approving project' });
  }
});

// Reject project (manager/admin only)
router.post('/:id/reject', authMiddleware, isManagerOrAdmin, [
  body('reason').notEmpty().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { reason } = req.body;

    // Check if project exists and is pending
    const checkResult = await db.query(
      'SELECT id, status FROM projects WHERE id = $1',
      [id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (checkResult.rows[0].status !== 'pending') {
      return res.status(400).json({ error: 'Project is not pending approval' });
    }

    // Reject project
    const result = await db.query(
      `UPDATE projects 
       SET status = 'rejected',
           approved_by = $1,
           approved_at = CURRENT_TIMESTAMP,
           rejection_reason = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [req.user.id, reason, id]
    );

    res.json({
      message: 'Project rejected',
      project: result.rows[0]
    });
  } catch (error) {
    console.error('Reject project error:', error);
    res.status(500).json({ error: 'Server error rejecting project' });
  }
});

// Get approved projects (for expense allocation)
router.get('/approved', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, code, name, description, start_date, end_date, budget, 
              status, project_manager, created_at
       FROM projects 
       WHERE status = 'approved' AND is_active = true
       ORDER BY start_date DESC, code`
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Fetch approved projects error:', error);
    res.status(500).json({ error: 'Server error fetching approved projects' });
  }
});

// Get project statistics
router.get('/:id/stats', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    // Get project details
    const projectResult = await db.query(
      'SELECT budget FROM projects WHERE id = $1',
      [id]
    );

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const budget = projectResult.rows[0].budget;

    // Get expense statistics
    const statsResult = await db.query(
      `SELECT
         COUNT(*) as expense_count,
         COALESCE(SUM(CASE WHEN status = 'approved' THEN amount ELSE 0 END), 0) as total_spent,
         COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0) as pending_amount,
         COALESCE(AVG(CASE WHEN status = 'approved' THEN amount ELSE NULL END), 0) as avg_expense,
         COALESCE(SUM(CASE WHEN status = 'approved' AND cost_type = 'CAPEX' THEN amount ELSE 0 END), 0) as capex_total,
         COALESCE(SUM(CASE WHEN status = 'approved' AND cost_type = 'OPEX' THEN amount ELSE 0 END), 0) as opex_total
       FROM expenses
       WHERE project_id = $1`,
      [id]
    );

    const stats = statsResult.rows[0];
    const remaining = budget ? budget - parseFloat(stats.total_spent) : null;
    const percentUsed = budget ? (parseFloat(stats.total_spent) / budget * 100).toFixed(2) : null;

    res.json({
      ...stats,
      budget,
      remaining,
      percent_used: percentUsed
    });
  } catch (error) {
    console.error('Fetch project stats error:', error);
    res.status(500).json({ error: 'Server error fetching project statistics' });
  }
});

// Get project details by ID
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      `SELECT p.id, p.code, p.name, p.description, p.start_date, p.end_date,
              p.budget, p.status, p.project_manager, p.created_at, p.updated_at,
              p.approved_at, p.rejection_reason,
              submitter.first_name || ' ' || submitter.last_name as submitted_by_name,
              submitter.email as submitted_by_email,
              approver.first_name || ' ' || approver.last_name as approved_by_name
       FROM projects p
       LEFT JOIN users submitter ON p.submitted_by = submitter.id
       LEFT JOIN users approver ON p.approved_by = approver.id
       WHERE p.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Fetch project error:', error);
    res.status(500).json({ error: 'Server error fetching project' });
  }
});

// Delete project (manager/admin/developer only)
router.delete('/:id', authMiddleware, isManagerOrAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if project exists
    const checkResult = await db.query(
      'SELECT id, code, name FROM projects WHERE id = $1',
      [id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Check if project has any expenses
    const expenseCheck = await db.query(
      'SELECT COUNT(*) as count FROM expenses WHERE project_id = $1',
      [id]
    );

    const expenseCount = parseInt(expenseCheck.rows[0].count);

    if (expenseCount > 0) {
      return res.status(400).json({
        error: `Cannot delete project. It has ${expenseCount} expense(s) associated with it. Please reassign or delete the expenses first.`
      });
    }

    // Delete the project
    await db.query('DELETE FROM projects WHERE id = $1', [id]);

    res.json({
      message: 'Project deleted successfully',
      project: checkResult.rows[0]
    });
  } catch (error) {
    console.error('Delete project error:', error);
    res.status(500).json({ error: 'Server error deleting project' });
  }
});

module.exports = router;
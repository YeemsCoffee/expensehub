const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authMiddleware, isManagerOrAdmin } = require('../middleware/auth');

// Get all pending approvals for the current user
router.get('/pending-for-me', authMiddleware, isManagerOrAdmin, async (req, res) => {
  try {
    const query = `
      SELECT
        e.id as expense_id,
        e.description,
        e.amount,
        e.date,
        e.category,
        e.cost_type,
        e.notes,
        e.vendor_name,
        submitter.first_name || ' ' || submitter.last_name as submitted_by,
        submitter.employee_id as submitter_employee_id,
        cc.code as cost_center_code,
        cc.name as cost_center_name,
        l.code as location_code,
        l.name as location_name,
        p.code as project_code,
        p.name as project_name,
        e.created_at as submitted_at,
        e.status
      FROM expenses e
      JOIN users submitter ON e.user_id = submitter.id
      LEFT JOIN cost_centers cc ON e.cost_center_id = cc.id
      LEFT JOIN locations l ON e.location_id = l.id
      LEFT JOIN projects p ON e.project_id = p.id
      WHERE e.assigned_approver_id = $1
        AND e.status = 'pending'
      ORDER BY e.created_at ASC
    `;

    const result = await db.query(query, [req.user.id]);
    res.json(result.rows);
  } catch (error) {
    console.error('Fetch pending approvals error:', error);
    res.status(500).json({ error: 'Server error fetching pending approvals' });
  }
});

// Approve an expense (direct assignment - simple approval)
router.post('/:expenseId/approve', authMiddleware, isManagerOrAdmin, [
  body('comments').optional().trim()
], async (req, res) => {
  try {
    const { comments } = req.body;
    const expenseId = req.params.expenseId;

    // Check if this expense is assigned to the current user and is pending
    const expenseCheck = await db.query(
      `SELECT id, status, assigned_approver_id
       FROM expenses
       WHERE id = $1 AND assigned_approver_id = $2 AND status = 'pending'`,
      [expenseId, req.user.id]
    );

    if (expenseCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Expense not found or not assigned to you' });
    }

    // Update the expense to approved
    await db.query(
      `UPDATE expenses
       SET status = 'approved',
           approved_by = $1,
           approved_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP,
           rejection_reason = $2
       WHERE id = $3`,
      [req.user.id, comments, expenseId]
    );

    res.json({
      message: 'Expense approved successfully'
    });
  } catch (error) {
    console.error('Approve expense error:', error);
    res.status(500).json({ error: 'Server error approving expense' });
  }
});

// Reject an expense (direct assignment - simple rejection)
router.post('/:expenseId/reject', authMiddleware, isManagerOrAdmin, [
  body('comments').notEmpty().trim().withMessage('Comments are required for rejection')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { comments } = req.body;
    const expenseId = req.params.expenseId;

    // Check if this expense is assigned to the current user and is pending
    const expenseCheck = await db.query(
      `SELECT id, status, assigned_approver_id
       FROM expenses
       WHERE id = $1 AND assigned_approver_id = $2 AND status = 'pending'`,
      [expenseId, req.user.id]
    );

    if (expenseCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Expense not found or not assigned to you' });
    }

    // Update the expense to rejected
    await db.query(
      `UPDATE expenses
       SET status = 'rejected',
           approved_by = $1,
           approved_at = CURRENT_TIMESTAMP,
           rejection_reason = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [req.user.id, comments, expenseId]
    );

    res.json({
      message: 'Expense rejected'
    });
  } catch (error) {
    console.error('Reject expense error:', error);
    res.status(500).json({ error: 'Server error rejecting expense' });
  }
});

// Get all expenses pending approval (overview for managers/admins)
router.get('/pending/all', authMiddleware, isManagerOrAdmin, async (req, res) => {
  try {
    const query = `
      SELECT
        e.id as expense_id,
        e.description,
        e.amount,
        e.date,
        e.category,
        submitter.first_name || ' ' || submitter.last_name as submitted_by,
        ea.current_level,
        ea.total_levels,
        af.name as approval_flow_name,
        (
          SELECT u.first_name || ' ' || u.last_name
          FROM approval_steps ast
          JOIN users u ON ast.approver_id = u.id
          WHERE ast.expense_approval_id = ea.id AND ast.level = ea.current_level
          LIMIT 1
        ) as current_approver,
        e.created_at as submitted_at
      FROM expense_approvals ea
      JOIN expenses e ON ea.expense_id = e.id
      JOIN approval_flows af ON ea.approval_flow_id = af.id
      JOIN users submitter ON e.user_id = submitter.id
      WHERE ea.status = 'pending'
      ORDER BY e.created_at ASC
    `;

    const result = await db.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Fetch all pending approvals error:', error);
    res.status(500).json({ error: 'Server error fetching pending approvals' });
  }
});

// Get approval history for a specific expense
router.get('/expense/:expenseId/history', authMiddleware, async (req, res) => {
  try {
    const query = `
      SELECT
        ast.id,
        ast.level,
        ast.status,
        ast.comments,
        ast.approved_at,
        u.first_name || ' ' || u.last_name as approver_name,
        af.name as approval_flow_name
      FROM approval_steps ast
      JOIN expense_approvals ea ON ast.expense_approval_id = ea.id
      JOIN approval_flows af ON ea.approval_flow_id = af.id
      JOIN users u ON ast.approver_id = u.id
      WHERE ea.expense_id = $1
      ORDER BY ast.level ASC
    `;

    const result = await db.query(query, [req.params.expenseId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Fetch approval history error:', error);
    res.status(500).json({ error: 'Server error fetching approval history' });
  }
});

module.exports = router;

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
        ast.id as approval_step_id,
        ast.level as approval_level,
        ea.total_levels,
        af.name as approval_flow_name,
        cc.code as cost_center_code,
        cc.name as cost_center_name,
        l.code as location_code,
        l.name as location_name,
        p.code as project_code,
        p.name as project_name,
        e.created_at as submitted_at,
        (
          SELECT json_agg(
            json_build_object(
              'level', s.level,
              'approver_id', s.approver_id,
              'approver_name', u.first_name || ' ' || u.last_name,
              'status', s.status,
              'approved_at', s.approved_at
            ) ORDER BY s.level
          )
          FROM approval_steps s
          JOIN users u ON s.approver_id = u.id
          WHERE s.expense_approval_id = ea.id
        ) as approval_chain
      FROM approval_steps ast
      JOIN expense_approvals ea ON ast.expense_approval_id = ea.id
      JOIN expenses e ON ea.expense_id = e.id
      JOIN approval_flows af ON ea.approval_flow_id = af.id
      JOIN users submitter ON e.user_id = submitter.id
      LEFT JOIN cost_centers cc ON e.cost_center_id = cc.id
      LEFT JOIN locations l ON e.location_id = l.id
      LEFT JOIN projects p ON e.project_id = p.id
      WHERE ast.approver_id = $1
        AND ast.status = 'pending'
        AND ea.current_level = ast.level
        AND ea.status = 'pending'
      ORDER BY e.created_at ASC
    `;

    const result = await db.query(query, [req.user.id]);
    res.json(result.rows);
  } catch (error) {
    console.error('Fetch pending approvals error:', error);
    res.status(500).json({ error: 'Server error fetching pending approvals' });
  }
});

// Approve an expense approval step
router.post('/:approvalStepId/approve', authMiddleware, isManagerOrAdmin, [
  body('comments').optional().trim()
], async (req, res) => {
  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    const { comments } = req.body;
    const approvalStepId = req.params.approvalStepId;

    // Check if this approval step exists and belongs to the current user
    const stepCheck = await client.query(
      `SELECT ast.*, ea.id as expense_approval_id, ea.expense_id, ea.current_level, ea.total_levels
       FROM approval_steps ast
       JOIN expense_approvals ea ON ast.expense_approval_id = ea.id
       WHERE ast.id = $1 AND ast.approver_id = $2 AND ast.status = 'pending'`,
      [approvalStepId, req.user.id]
    );

    if (stepCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Approval step not found or already processed' });
    }

    const step = stepCheck.rows[0];

    // Make sure this is the current level
    if (step.level !== step.current_level) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'This approval is not ready to be processed yet' });
    }

    // Update the approval step to approved
    await client.query(
      `UPDATE approval_steps
       SET status = 'approved',
           comments = $1,
           approved_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [comments, approvalStepId]
    );

    // Check if this was the last approval level
    if (step.current_level >= step.total_levels) {
      // This was the final approval - mark expense as fully approved
      await client.query(
        `UPDATE expense_approvals
         SET status = 'approved',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [step.expense_approval_id]
      );

      await client.query(
        `UPDATE expenses
         SET status = 'approved',
             approved_by = $1,
             approved_at = CURRENT_TIMESTAMP,
             fully_approved_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [req.user.id, step.expense_id]
      );
    } else {
      // Move to the next approval level
      await client.query(
        `UPDATE expense_approvals
         SET current_level = current_level + 1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [step.expense_approval_id]
      );
    }

    await client.query('COMMIT');

    res.json({
      message: step.current_level >= step.total_levels
        ? 'Expense fully approved'
        : 'Approval recorded, moved to next level',
      isFinalApproval: step.current_level >= step.total_levels
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Approve expense error:', error);
    res.status(500).json({ error: 'Server error approving expense' });
  } finally {
    client.release();
  }
});

// Reject an expense approval step
router.post('/:approvalStepId/reject', authMiddleware, isManagerOrAdmin, [
  body('comments').notEmpty().trim().withMessage('Comments are required for rejection')
], async (req, res) => {
  const client = await db.pool.connect();

  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    await client.query('BEGIN');

    const { comments } = req.body;
    const approvalStepId = req.params.approvalStepId;

    // Check if this approval step exists and belongs to the current user
    const stepCheck = await client.query(
      `SELECT ast.*, ea.id as expense_approval_id, ea.expense_id, ea.current_level
       FROM approval_steps ast
       JOIN expense_approvals ea ON ast.expense_approval_id = ea.id
       WHERE ast.id = $1 AND ast.approver_id = $2 AND ast.status = 'pending'`,
      [approvalStepId, req.user.id]
    );

    if (stepCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Approval step not found or already processed' });
    }

    const step = stepCheck.rows[0];

    // Make sure this is the current level
    if (step.level !== step.current_level) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'This approval is not ready to be processed yet' });
    }

    // Update the approval step to rejected
    await client.query(
      `UPDATE approval_steps
       SET status = 'rejected',
           comments = $1,
           approved_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [comments, approvalStepId]
    );

    // Mark the entire expense approval as rejected
    await client.query(
      `UPDATE expense_approvals
       SET status = 'rejected',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [step.expense_approval_id]
    );

    // Mark the expense as rejected
    await client.query(
      `UPDATE expenses
       SET status = 'rejected',
           approved_by = $1,
           approved_at = CURRENT_TIMESTAMP,
           rejection_reason = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [req.user.id, comments, step.expense_id]
    );

    await client.query('COMMIT');

    res.json({
      message: 'Expense rejected'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Reject expense error:', error);
    res.status(500).json({ error: 'Server error rejecting expense' });
  } finally {
    client.release();
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

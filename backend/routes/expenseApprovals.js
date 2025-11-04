const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authMiddleware, isManagerOrAdmin } = require('../middleware/auth');

// Get all pending approvals for the current user (org-chart-based)
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
        e.approval_chain,
        e.current_approval_level,
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
      WHERE e.status = 'pending'
        AND e.approval_chain IS NOT NULL
      ORDER BY e.created_at ASC
    `;

    const result = await db.query(query);

    // Filter expenses where current user is the approver at current level
    const myApprovals = result.rows.filter(expense => {
      if (!expense.approval_chain) return false;

      const chain = typeof expense.approval_chain === 'string'
        ? JSON.parse(expense.approval_chain)
        : expense.approval_chain;

      const currentLevelApprover = chain.find(step => step.level === expense.current_approval_level);
      return currentLevelApprover && currentLevelApprover.user_id === req.user.id;
    });

    res.json(myApprovals);
  } catch (error) {
    console.error('Fetch pending approvals error:', error);
    res.status(500).json({ error: 'Server error fetching pending approvals' });
  }
});

// Approve an expense (org-chart-based hierarchical approval)
router.post('/:expenseId/approve', authMiddleware, isManagerOrAdmin, [
  body('comments').optional().trim()
], async (req, res) => {
  try {
    const { comments } = req.body;
    const expenseId = req.params.expenseId;

    // Get the expense with approval chain
    const expenseResult = await db.query(
      `SELECT id, status, approval_chain, current_approval_level
       FROM expenses
       WHERE id = $1 AND status = 'pending'`,
      [expenseId]
    );

    if (expenseResult.rows.length === 0) {
      return res.status(404).json({ error: 'Expense not found or already processed' });
    }

    const expense = expenseResult.rows[0];
    const chain = typeof expense.approval_chain === 'string'
      ? JSON.parse(expense.approval_chain)
      : expense.approval_chain;

    if (!chain || chain.length === 0) {
      return res.status(400).json({ error: 'No approval chain defined for this expense' });
    }

    // Find current level approver
    const currentLevelApprover = chain.find(step => step.level === expense.current_approval_level);

    if (!currentLevelApprover || currentLevelApprover.user_id !== req.user.id) {
      return res.status(403).json({ error: 'You are not authorized to approve this expense at this level' });
    }

    // Update current level to approved
    const updatedChain = chain.map(step => {
      if (step.level === expense.current_approval_level) {
        return {
          ...step,
          status: 'approved',
          approved_by: req.user.id,
          approved_at: new Date().toISOString(),
          comments: comments || null
        };
      }
      return step;
    });

    // Check if this is the last level
    const isLastLevel = expense.current_approval_level >= chain.length;

    if (isLastLevel) {
      // Final approval - mark expense as approved
      await db.query(
        `UPDATE expenses
         SET status = 'approved',
             approved_by = $1,
             approved_at = CURRENT_TIMESTAMP,
             approval_chain = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [req.user.id, JSON.stringify(updatedChain), expenseId]
      );

      res.json({
        message: 'Expense fully approved',
        finalApproval: true
      });
    } else {
      // Move to next level
      await db.query(
        `UPDATE expenses
         SET current_approval_level = $1,
             approval_chain = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [expense.current_approval_level + 1, JSON.stringify(updatedChain), expenseId]
      );

      const nextApprover = chain.find(step => step.level === expense.current_approval_level + 1);

      res.json({
        message: 'Expense approved at this level',
        finalApproval: false,
        nextLevel: expense.current_approval_level + 1,
        nextApprover: nextApprover ? nextApprover.user_name : 'Unknown'
      });
    }
  } catch (error) {
    console.error('Approve expense error:', error);
    res.status(500).json({ error: 'Server error approving expense' });
  }
});

// Reject an expense (org-chart-based - rejection at any level fails the whole expense)
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

    // Get the expense with approval chain
    const expenseResult = await db.query(
      `SELECT id, status, approval_chain, current_approval_level
       FROM expenses
       WHERE id = $1 AND status = 'pending'`,
      [expenseId]
    );

    if (expenseResult.rows.length === 0) {
      return res.status(404).json({ error: 'Expense not found or already processed' });
    }

    const expense = expenseResult.rows[0];
    const chain = typeof expense.approval_chain === 'string'
      ? JSON.parse(expense.approval_chain)
      : expense.approval_chain;

    if (!chain || chain.length === 0) {
      return res.status(400).json({ error: 'No approval chain defined for this expense' });
    }

    // Find current level approver
    const currentLevelApprover = chain.find(step => step.level === expense.current_approval_level);

    if (!currentLevelApprover || currentLevelApprover.user_id !== req.user.id) {
      return res.status(403).json({ error: 'You are not authorized to reject this expense at this level' });
    }

    // Update current level to rejected and mark expense as rejected
    const updatedChain = chain.map(step => {
      if (step.level === expense.current_approval_level) {
        return {
          ...step,
          status: 'rejected',
          approved_by: req.user.id,
          approved_at: new Date().toISOString(),
          comments: comments
        };
      }
      return step;
    });

    // Rejection at any level rejects the entire expense
    await db.query(
      `UPDATE expenses
       SET status = 'rejected',
           approved_by = $1,
           approved_at = CURRENT_TIMESTAMP,
           rejection_reason = $2,
           approval_chain = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4`,
      [req.user.id, comments, JSON.stringify(updatedChain), expenseId]
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

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authMiddleware, isAdminOrDeveloper } = require('../middleware/auth');
const { sendExpenseApprovalNotification, sendExpenseRejectionNotification } = require('../services/emailService');
const { sendOrderToAmazon } = require('./amazonPunchout');
const { scheduleXeroAutoSync } = require('../services/xeroAutoSync');
const {
  parseChain,
  isStepApprover,
  isPrivilegedRole
} = require('../services/approvalService');

// Shared projection for pending-approval lists.  approval_chain is JSONB; the
// ::jsonb cast is a no-op there and keeps this working if the column was ever
// created as json/text.
const PENDING_SELECT = `
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
    jsonb_array_length(coalesce(e.approval_chain::jsonb, '[]'::jsonb)) as total_levels,
    (
      SELECT coalesce(step->>'user_name', 'Administrator')
      FROM jsonb_array_elements(coalesce(e.approval_chain::jsonb, '[]'::jsonb)) step
      WHERE (step->>'level')::int = e.current_approval_level
      LIMIT 1
    ) as current_approver,
    (
      SELECT (step->>'user_id')::int = $1 OR (step->>'role' = 'admin' AND $2::boolean)
      FROM jsonb_array_elements(coalesce(e.approval_chain::jsonb, '[]'::jsonb)) step
      WHERE (step->>'level')::int = e.current_approval_level
      LIMIT 1
    ) as assigned_to_me,
    e.amazon_spaid IS NOT NULL as is_amazon_order,
    e.user_id as submitter_id,
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
`;

// Pending approvals where the current user is the approver at the current
// level.  Filtering happens in SQL so we never load other approvers' items.
// Authorization is the chain itself, so any authenticated user who appears in
// a chain (including an employee-role manager) can see their queue.
router.get('/pending-for-me', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      `${PENDING_SELECT}
        AND e.approval_chain IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements(e.approval_chain::jsonb) step
          WHERE (step->>'level')::int = e.current_approval_level
            AND (
              (step->>'user_id')::int = $1
              OR (step->>'role' = 'admin' AND $2::boolean)
            )
        )
      ORDER BY e.created_at ASC`,
      [req.user.id, isPrivilegedRole(req.user.role)]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Fetch pending approvals error:', error);
    res.status(500).json({ error: 'Server error fetching pending approvals' });
  }
});

// Company-wide view of everything pending (admin/developer).  Includes items
// with no chain at all so stuck rows are visible rather than invisible.
router.get('/pending/all', authMiddleware, isAdminOrDeveloper, async (req, res) => {
  try {
    const result = await db.query(
      `${PENDING_SELECT} ORDER BY e.created_at ASC`,
      [req.user.id, true]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Fetch all pending approvals error:', error);
    res.status(500).json({ error: 'Server error fetching pending approvals' });
  }
});

async function loadPendingExpense(expenseId) {
  const result = await db.query(
    `SELECT e.*,
            u.email as submitter_email,
            u.first_name || ' ' || u.last_name as submitter_name
     FROM expenses e
     JOIN users u ON e.user_id = u.id
     WHERE e.id = $1 AND e.status = 'pending'`,
    [expenseId]
  );
  return result.rows[0] || null;
}

/**
 * Decide whether `user` may act on `expense` right now.
 * Returns { chain, step, override } or null.  Admins/developers may override
 * any level (e.g. to unstick an item whose approver left), and the override
 * is recorded on the chain step.
 */
function authorizeAction(expense, user) {
  const chain = parseChain(expense.approval_chain) || [];
  const step = chain.find(s => Number(s.level) === Number(expense.current_approval_level)) || null;

  if (isStepApprover(step, user)) {
    return { chain, step, override: false };
  }
  if (isPrivilegedRole(user.role)) {
    return { chain, step, override: true };
  }
  return null;
}

function markStep(chain, level, patch) {
  return chain.map(step => (Number(step.level) === Number(level) ? { ...step, ...patch } : step));
}

// After final approval, place the Amazon order (if any) outside the request.
function placeAmazonOrderAfterApproval(expenseId) {
  setImmediate(async () => {
    try {
      const lockResult = await db.query(
        `UPDATE expenses
         SET amazon_order_status = 'processing',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
           AND amazon_spaid IS NOT NULL
           AND amazon_order_status = 'pending'
         RETURNING *`,
        [expenseId]
      );

      if (lockResult.rows.length === 0) {
        return; // Not an Amazon order, or already being processed.
      }

      const expense = lockResult.rows[0];
      console.log(`🛒 [Amazon Order] Placing order for expense ${expense.id} after final approval`);

      let location = null;
      if (expense.location_id) {
        const locResult = await db.query('SELECT * FROM locations WHERE id = $1', [expense.location_id]);
        location = locResult.rows[0] || null;
      }

      const submitterResult = await db.query(
        'SELECT email, first_name, last_name FROM users WHERE id = $1',
        [expense.user_id]
      );
      const submitter = submitterResult.rows[0];

      const orderResult = await sendOrderToAmazon(expense, {
        email: submitter.email,
        name: `${submitter.first_name} ${submitter.last_name}`,
        location
      });

      if (orderResult.success) {
        console.log(`✓ [Amazon Order] Order placed. PO Number: ${orderResult.poNumber}`);
        await db.query(
          `UPDATE expenses
           SET amazon_po_number = $1,
               amazon_order_status = 'confirmed',
               amazon_order_sent_at = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [orderResult.poNumber, expense.id]
        );
      } else {
        console.error(`✗ [Amazon Order] Failed to place order for expense ${expense.id}:`, orderResult.error);
        await db.query(
          `UPDATE expenses
           SET amazon_order_status = 'failed',
               amazon_order_sent_at = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [expense.id]
        );
      }
    } catch (orderError) {
      console.error(`Error placing Amazon order for expense ${expenseId}:`, orderError);
      await db.query(
        `UPDATE expenses
         SET amazon_order_status = 'failed',
             amazon_order_sent_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND amazon_order_status = 'processing'`,
        [expenseId]
      ).catch(err => console.error('Failed to mark Amazon order failed:', err));
    }
  });
}

// Approve at the current level (org-chart-based hierarchical approval)
router.post('/:expenseId/approve', authMiddleware, [
  body('comments').optional().trim()
], async (req, res) => {
  try {
    const { comments } = req.body;
    const expenseId = req.params.expenseId;

    const expense = await loadPendingExpense(expenseId);
    if (!expense) {
      return res.status(404).json({ error: 'Expense not found or already processed' });
    }

    if (Number(expense.user_id) === Number(req.user.id)) {
      return res.status(403).json({ error: 'You cannot approve your own expense' });
    }

    const auth = authorizeAction(expense, req.user);
    if (!auth) {
      return res.status(403).json({ error: 'You are not authorized to approve this expense at this level' });
    }
    const { chain, override } = auth;

    const now = new Date().toISOString();
    const updatedChain = chain.length > 0
      ? markStep(chain, expense.current_approval_level, {
          status: 'approved',
          approved_by: req.user.id,
          approved_by_name: req.user.name,
          approved_at: now,
          comments: comments || null,
          ...(override ? { override: true } : {})
        })
      : [{
          level: 1,
          user_id: req.user.id,
          user_name: req.user.name,
          status: 'approved',
          approved_by: req.user.id,
          approved_at: now,
          comments: comments || null,
          override: true
        }];

    // An admin override completes the approval; otherwise advance the chain.
    const isLastLevel = override || expense.current_approval_level >= chain.length;

    // The status/level guard makes concurrent approvals of the same item safe:
    // only one request can advance a given level.
    let updateResult;
    if (isLastLevel) {
      updateResult = await db.query(
        `UPDATE expenses
         SET status = 'approved',
             approved_by = $1,
             approved_at = CURRENT_TIMESTAMP,
             approval_chain = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3 AND status = 'pending' AND current_approval_level IS NOT DISTINCT FROM $4
         RETURNING id`,
        [req.user.id, JSON.stringify(updatedChain), expenseId, expense.current_approval_level]
      );
    } else {
      updateResult = await db.query(
        `UPDATE expenses
         SET current_approval_level = $1,
             approval_chain = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3 AND status = 'pending' AND current_approval_level IS NOT DISTINCT FROM $4
         RETURNING id`,
        [expense.current_approval_level + 1, JSON.stringify(updatedChain), expenseId, expense.current_approval_level]
      );
    }

    if (updateResult.rows.length === 0) {
      return res.status(409).json({ error: 'This expense was updated by someone else. Please refresh.' });
    }

    if (isLastLevel) {
      sendExpenseApprovalNotification(
        { date: expense.date, amount: expense.amount, category: expense.category, description: expense.description },
        { email: expense.submitter_email, name: expense.submitter_name },
        { name: req.user.name }
      ).catch(err => console.error('Failed to send approval email:', err));

      placeAmazonOrderAfterApproval(expense.id);
      scheduleXeroAutoSync(expense.id);

      return res.json({
        message: override ? 'Expense approved (administrator override)' : 'Expense fully approved',
        finalApproval: true,
        override
      });
    }

    const nextApprover = chain.find(step => Number(step.level) === expense.current_approval_level + 1);
    res.json({
      message: 'Expense approved at this level',
      finalApproval: false,
      nextLevel: expense.current_approval_level + 1,
      nextApprover: nextApprover ? nextApprover.user_name : 'Unknown'
    });
  } catch (error) {
    console.error('Approve expense error:', error);
    res.status(500).json({ error: 'Server error approving expense' });
  }
});

// Reject (rejection at any level rejects the whole expense)
router.post('/:expenseId/reject', authMiddleware, [
  body('comments').notEmpty().trim().withMessage('Comments are required for rejection')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { comments } = req.body;
    const expenseId = req.params.expenseId;

    const expense = await loadPendingExpense(expenseId);
    if (!expense) {
      return res.status(404).json({ error: 'Expense not found or already processed' });
    }

    const auth = authorizeAction(expense, req.user);
    if (!auth) {
      return res.status(403).json({ error: 'You are not authorized to reject this expense at this level' });
    }
    const { chain, override } = auth;

    const updatedChain = markStep(chain, expense.current_approval_level, {
      status: 'rejected',
      approved_by: req.user.id,
      approved_by_name: req.user.name,
      approved_at: new Date().toISOString(),
      comments,
      ...(override ? { override: true } : {})
    });

    const updateResult = await db.query(
      `UPDATE expenses
       SET status = 'rejected',
           approved_by = $1,
           approved_at = CURRENT_TIMESTAMP,
           rejection_reason = $2,
           approval_chain = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4 AND status = 'pending' AND current_approval_level IS NOT DISTINCT FROM $5
       RETURNING id`,
      [req.user.id, comments, JSON.stringify(updatedChain), expenseId, expense.current_approval_level]
    );

    if (updateResult.rows.length === 0) {
      return res.status(409).json({ error: 'This expense was updated by someone else. Please refresh.' });
    }

    sendExpenseRejectionNotification(
      { date: expense.date, amount: expense.amount, category: expense.category, description: expense.description },
      { email: expense.submitter_email, name: expense.submitter_name },
      { name: req.user.name },
      comments
    ).catch(err => console.error('Failed to send rejection email:', err));

    res.json({ message: 'Expense rejected', override });
  } catch (error) {
    console.error('Reject expense error:', error);
    res.status(500).json({ error: 'Server error rejecting expense' });
  }
});

// Approval history for an expense, read from the stored chain.
router.get('/expense/:expenseId/history', authMiddleware, async (req, res) => {
  try {
    const params = [req.params.expenseId];
    let sql = 'SELECT user_id, approval_chain, current_approval_level, status FROM expenses WHERE id = $1';
    if (!isPrivilegedRole(req.user.role)) {
      sql += ' AND user_id = $2';
      params.push(req.user.id);
    }

    const result = await db.query(sql, params);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    const expense = result.rows[0];
    const chain = parseChain(expense.approval_chain) || [];
    res.json({
      status: expense.status,
      current_approval_level: expense.current_approval_level,
      steps: chain.map(step => ({
        level: step.level,
        approver_name: step.user_name || 'Administrator',
        status: step.status,
        comments: step.comments || null,
        approved_at: step.approved_at || null,
        approved_by_name: step.approved_by_name || null,
        override: !!step.override
      }))
    });
  } catch (error) {
    console.error('Fetch approval history error:', error);
    res.status(500).json({ error: 'Server error fetching approval history' });
  }
});

module.exports = router;

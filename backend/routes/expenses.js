const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authMiddleware, isManagerOrAdmin, isAdminOrDeveloper } = require('../middleware/auth');
const { sendExpenseSubmissionNotification } = require('../services/emailService');
const { buildApprovalChain, approverRecipients } = require('../services/approvalService');
const { scheduleXeroAutoSync } = require('../services/xeroAutoSync');
const xeroService = require('../services/xeroService');
const { sendOrderToAmazon } = require('./amazonPunchout');

// Helper function to determine cost type based on category and amount
const determineCostType = (category, amount) => {
  const capexKeywords = ['equipment', 'hardware', 'furniture', 'fixtures', 'vehicle'];
  const capexThreshold = 2500; // Expenses over $2,500 may be CAPEX

  const categoryLower = category.toLowerCase();
  const hasCapexKeyword = capexKeywords.some(keyword => categoryLower.includes(keyword));

  if (hasCapexKeyword && amount >= capexThreshold) {
    return 'CAPEX';
  }

  return 'OPEX';
};

// Pagination defaults shared by the list endpoints in this file
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const parseLimit = (value) => Math.min(Math.max(parseInt(value, 10) || DEFAULT_LIMIT, 1), MAX_LIMIT);
const parseOffset = (value) => Math.max(parseInt(value, 10) || 0, 0);

// Get all expenses for current user (or all expenses for admin/developer)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const {
      status,
      category,
      costType,
      locationId,
      projectId,
      costCenterId,
      startDate,
      endDate,
      minAmount,
      maxAmount
    } = req.query;

    const isPrivileged = ['admin', 'developer'].includes(req.user.role);

    const limit = parseLimit(req.query.limit);
    const offset = parseOffset(req.query.offset);

    const selectClause = `
      SELECT e.*,
             cc.code as cost_center_code, cc.name as cost_center_name,
             l.code as location_code, l.name as location_name,
             p.code as project_code, p.name as project_name,
             u.first_name || ' ' || u.last_name as approved_by_name,
             submitter.first_name || ' ' || submitter.last_name as submitted_by_name,
             submitter.email as submitted_by_email
    `;

    const fromClause = `
      FROM expenses e
      LEFT JOIN cost_centers cc ON e.cost_center_id = cc.id
      LEFT JOIN locations l ON e.location_id = l.id
      LEFT JOIN projects p ON e.project_id = p.id
      LEFT JOIN users u ON e.approved_by = u.id
      LEFT JOIN users submitter ON e.user_id = submitter.id
    `;

    // Build the WHERE clause once so the count and the page use identical filters
    let whereClause = ` WHERE 1=1`;
    const params = [];
    let paramIndex = 1;

    // Admin/developer see all expenses; others see only their own
    if (!isPrivileged) {
      whereClause += ` AND e.user_id = $${paramIndex}`;
      params.push(req.user.id);
      paramIndex++;
    }

    if (status) {
      whereClause += ` AND e.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (category) {
      whereClause += ` AND e.category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    if (costType) {
      whereClause += ` AND e.cost_type = $${paramIndex}`;
      params.push(costType);
      paramIndex++;
    }

    if (locationId) {
      whereClause += ` AND e.location_id = $${paramIndex}`;
      params.push(locationId);
      paramIndex++;
    }

    if (projectId) {
      whereClause += ` AND e.project_id = $${paramIndex}`;
      params.push(projectId);
      paramIndex++;
    }

    if (costCenterId) {
      whereClause += ` AND e.cost_center_id = $${paramIndex}`;
      params.push(costCenterId);
      paramIndex++;
    }

    if (startDate) {
      whereClause += ` AND e.date >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      whereClause += ` AND e.date <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    if (minAmount) {
      whereClause += ` AND e.amount >= $${paramIndex}`;
      params.push(minAmount);
      paramIndex++;
    }

    if (maxAmount) {
      whereClause += ` AND e.amount <= $${paramIndex}`;
      params.push(maxAmount);
      paramIndex++;
    }

    const countResult = await db.query(
      `SELECT COUNT(*) AS total${fromClause}${whereClause}`,
      params
    );

    const result = await db.query(
      `${selectClause}${fromClause}${whereClause}
       ORDER BY e.date DESC, e.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    res.set('X-Total-Count', String(countResult.rows[0].total));
    res.json(result.rows);
  } catch (error) {
    console.error('Fetch expenses error:', error);
    res.status(500).json({ error: 'Server error fetching expenses' });
  }
});

// Get single expense
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const isPrivileged = ['admin', 'developer'].includes(req.user.role);

    let query = `
      SELECT e.*,
             cc.code as cost_center_code, cc.name as cost_center_name,
             l.code as location_code, l.name as location_name,
             p.code as project_code, p.name as project_name,
             u.first_name || ' ' || u.last_name as approved_by_name,
             submitter.first_name || ' ' || submitter.last_name as submitted_by_name,
             submitter.email as submitted_by_email
      FROM expenses e
      LEFT JOIN cost_centers cc ON e.cost_center_id = cc.id
      LEFT JOIN locations l ON e.location_id = l.id
      LEFT JOIN projects p ON e.project_id = p.id
      LEFT JOIN users u ON e.approved_by = u.id
      LEFT JOIN users submitter ON e.user_id = submitter.id
      WHERE e.id = $1`;

    const params = [req.params.id];

    // Non-privileged users can only see their own expenses
    if (!isPrivileged) {
      query += ` AND e.user_id = $2`;
      params.push(req.user.id);
    }

    const result = await db.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Fetch expense error:', error);
    res.status(500).json({ error: 'Server error fetching expense' });
  }
});

// Create new expense with enhanced dimensions
router.post('/', authMiddleware, [
  body('date').isISO8601().toDate(),
  body('description').notEmpty().trim(),
  body('category').notEmpty().trim(),
  body('amount').isFloat({ min: 0.01 }),
  body('subtotal').optional().isFloat({ min: 0 }),
  body('tax').optional().isFloat({ min: 0 }),
  body('tip').optional().isFloat({ min: 0 }),
  body('costCenterId').isInt(),
  body('locationId').optional().isInt(),
  body('projectId').optional().isInt(),
  body('wbsElementId').optional().isInt(),
  body('costType').optional().isIn(['OPEX', 'CAPEX']),
  body('paymentMethod').optional().trim(),
  body('vendorName').optional().trim(),
  body('glAccount').optional().trim(),
  body('notes').optional().trim(),
  body('isReimbursable').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      date, description, category, amount, subtotal, tax, tip, costCenterId,
      locationId, projectId, wbsElementId, costType, paymentMethod,
      vendorName, glAccount, notes, isReimbursable
    } = req.body;

    // Auto-determine cost type if not provided
    // Project expenses default to CAPEX
    const finalCostType = costType || (projectId ? 'CAPEX' : determineCostType(category, amount));

    // Routing is shared with cart checkout (services/approvalService).
    // An employee with no usable manager is routed to administrators rather
    // than being silently auto-approved.
    const { approvalChain, approvalRuleId, reason: approvalReason } = await buildApprovalChain(db, {
      user: req.user,
      amount,
      costCenterId
    });
    const currentApprovalLevel = 1;

    console.log(`Expense routing for user ${req.user.id}: ${approvalReason}` +
      (approvalChain ? ` (${approvalChain.length} level(s))` : ''));

    // Determine status: auto-approve if no approval chain required
    const status = approvalChain ? 'pending' : 'approved';
    const approvedAt = approvalChain ? null : new Date();

    const result = await db.query(
      `INSERT INTO expenses (
        user_id, cost_center_id, location_id, project_id, wbs_element_id,
        date, description, category, amount, subtotal, tax, tip, cost_type,
        payment_method, vendor_name, gl_account, notes, is_reimbursable,
        approval_rule_id, approval_chain, current_approval_level,
        status, approved_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
      RETURNING *`,
      [
        req.user.id, costCenterId, locationId, projectId, wbsElementId,
        date, description, category, amount, subtotal, tax, tip, finalCostType,
        paymentMethod, vendorName, glAccount, notes, isReimbursable || false,
        approvalRuleId, approvalChain ? JSON.stringify(approvalChain) : null, currentApprovalLevel,
        status, approvedAt
      ]
    );

    // Send email notification to the first approver in the chain (non-blocking)
    if (approvalChain && approvalChain.length > 0) {
      const expenseData = {
        id: result.rows[0].id,
        date: date,
        amount: amount,
        category: category,
        description: description,
        vendor_name: vendorName,
        notes: notes
      };
      const submitterData = {
        name: `${req.user.firstName} ${req.user.lastName}`
      };

      // Send email asynchronously without blocking the response
      for (const recipient of approverRecipients(approvalChain[0])) {
        sendExpenseSubmissionNotification(expenseData, recipient, submitterData)
          .catch(err => console.error('Failed to send email notification:', err));
      }
    }

    res.status(201).json({
      message: 'Expense created successfully',
      expense: result.rows[0],
      approvalChain: approvalChain,
      autoApproved: !approvalChain,
      approvalReason
    });
  } catch (error) {
    console.error('Create expense error:', error);
    res.status(500).json({ error: 'Server error creating expense' });
  }
});

// Update expense
router.put('/:id', authMiddleware, [
  body('date').optional().isISO8601().toDate(),
  body('description').optional().trim(),
  body('category').optional().trim(),
  body('amount').optional().isFloat({ min: 0.01 }),
  body('costCenterId').optional().isInt(),
  body('locationId').optional().isInt(),
  body('projectId').optional().isInt(),
  body('costType').optional().isIn(['OPEX', 'CAPEX']),
  body('paymentMethod').optional().trim(),
  body('vendorName').optional().trim(),
  body('glAccount').optional().trim(),
  body('notes').optional().trim(),
  body('isReimbursable').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const isPrivileged = ['admin', 'developer'].includes(req.user.role);

    // Check if expense exists (admin/developer can edit any expense)
    let checkQuery, checkParams;
    if (isPrivileged) {
      checkQuery = 'SELECT status, user_id FROM expenses WHERE id = $1';
      checkParams = [req.params.id];
    } else {
      checkQuery = 'SELECT status, user_id FROM expenses WHERE id = $1 AND user_id = $2';
      checkParams = [req.params.id, req.user.id];
    }

    const checkResult = await db.query(checkQuery, checkParams);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    // Regular users can only update pending expenses; admin/developer can update any status
    if (!isPrivileged && checkResult.rows[0].status !== 'pending') {
      return res.status(400).json({ error: 'Cannot update expense that has been approved or rejected' });
    }

    const {
      date, description, category, amount, costCenterId,
      locationId, projectId, costType, paymentMethod,
      vendorName, glAccount, notes, isReimbursable
    } = req.body;

    // If the amount or cost center of a still-pending expense changes, the
    // approval rule (and therefore the chain) may change too.  Recompute it
    // from scratch so an expense cannot be submitted small and edited large.
    let rerouted = null;
    const existing = checkResult.rows[0];
    if (!isPrivileged && existing.status === 'pending' && (amount !== undefined || costCenterId !== undefined)) {
      const current = await db.query(
        'SELECT amount, cost_center_id, approval_chain FROM expenses WHERE id = $1',
        [req.params.id]
      );
      const newAmount = amount !== undefined ? Number(amount) : Number(current.rows[0].amount);
      const newCostCenterId = costCenterId !== undefined ? costCenterId : current.rows[0].cost_center_id;
      const amountChanged = Number(current.rows[0].amount) !== newAmount;
      const costCenterChanged = Number(current.rows[0].cost_center_id) !== Number(newCostCenterId);

      if (amountChanged || costCenterChanged) {
        rerouted = await buildApprovalChain(db, {
          user: req.user,
          amount: newAmount,
          costCenterId: newCostCenterId
        });
      }
    }

    const result = await db.query(
      `UPDATE expenses
       SET date = COALESCE($1, date),
           description = COALESCE($2, description),
           category = COALESCE($3, category),
           amount = COALESCE($4, amount),
           cost_center_id = COALESCE($5, cost_center_id),
           location_id = COALESCE($6, location_id),
           project_id = COALESCE($7, project_id),
           cost_type = COALESCE($8, cost_type),
           payment_method = COALESCE($9, payment_method),
           vendor_name = COALESCE($10, vendor_name),
           gl_account = COALESCE($11, gl_account),
           notes = COALESCE($12, notes),
           is_reimbursable = COALESCE($13, is_reimbursable),
           ${rerouted ? `
           approval_rule_id = $15,
           approval_chain = $16,
           current_approval_level = 1,
           status = $17,
           approved_at = $18,
           approved_by = NULL,` : ''}
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $14
       RETURNING *`,
      [
        date, description, category, amount, costCenterId,
        locationId, projectId, costType, paymentMethod,
        vendorName, glAccount, notes, isReimbursable,
        req.params.id,
        ...(rerouted ? [
          rerouted.approvalRuleId,
          rerouted.approvalChain ? JSON.stringify(rerouted.approvalChain) : null,
          rerouted.approvalChain ? 'pending' : 'approved',
          rerouted.approvalChain ? null : new Date()
        ] : [])
      ]
    );

    res.json({
      message: rerouted
        ? 'Expense updated and re-routed for approval'
        : 'Expense updated successfully',
      expense: result.rows[0],
      approvalChain: rerouted ? rerouted.approvalChain : undefined
    });
  } catch (error) {
    console.error('Update expense error:', error);
    res.status(500).json({ error: 'Server error updating expense' });
  }
});

// Rescind expense (user withdraws their own pending expense)
router.post('/:id/rescind', authMiddleware, async (req, res) => {
  try {
    // Check if expense exists and belongs to user
    const checkResult = await db.query(
      'SELECT status FROM expenses WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    // Can only rescind pending expenses
    if (checkResult.rows[0].status !== 'pending') {
      return res.status(400).json({ error: 'Can only rescind pending expenses' });
    }

    await db.query(
      `UPDATE expenses
       SET status = 'rejected',
           rejection_reason = 'Rescinded by submitter',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );

    res.json({ message: 'Expense rescinded successfully' });
  } catch (error) {
    console.error('Rescind expense error:', error);
    res.status(500).json({ error: 'Server error rescinding expense' });
  }
});

// Delete expense
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const isPrivileged = ['admin', 'developer'].includes(req.user.role);

    // Check if expense exists (admin/developer can delete any expense)
    let checkQuery, checkParams;
    if (isPrivileged) {
      checkQuery = 'SELECT status FROM expenses WHERE id = $1';
      checkParams = [req.params.id];
    } else {
      checkQuery = 'SELECT status FROM expenses WHERE id = $1 AND user_id = $2';
      checkParams = [req.params.id, req.user.id];
    }

    const checkResult = await db.query(checkQuery, checkParams);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    // Regular users can't delete approved expenses; admin/developer can
    if (!isPrivileged && checkResult.rows[0].status === 'approved') {
      return res.status(400).json({ error: 'Cannot delete approved expense' });
    }

    await db.query('DELETE FROM expenses WHERE id = $1', [req.params.id]);

    res.json({ message: 'Expense deleted successfully' });
  } catch (error) {
    console.error('Delete expense error:', error);
    res.status(500).json({ error: 'Server error deleting expense' });
  }
});

// Get all pending expenses (for managers/admins) with filters
router.get('/pending/all', authMiddleware, isManagerOrAdmin, async (req, res) => {
  try {
    const { locationId, projectId, costCenterId, costType } = req.query;

    const limit = parseLimit(req.query.limit);
    const offset = parseOffset(req.query.offset);

    const selectClause = `
      SELECT e.*,
             u.first_name || ' ' || u.last_name as employee_name,
             u.employee_id,
             cc.code as cost_center_code, cc.name as cost_center_name,
             l.code as location_code, l.name as location_name,
             p.code as project_code, p.name as project_name
    `;

    const fromClause = `
      FROM expenses e
      JOIN users u ON e.user_id = u.id
      LEFT JOIN cost_centers cc ON e.cost_center_id = cc.id
      LEFT JOIN locations l ON e.location_id = l.id
      LEFT JOIN projects p ON e.project_id = p.id
    `;

    // Build the WHERE clause once so the count and the page use identical filters
    let whereClause = ` WHERE e.status = 'pending'`;
    const params = [];
    let paramIndex = 1;

    if (locationId) {
      whereClause += ` AND e.location_id = $${paramIndex}`;
      params.push(locationId);
      paramIndex++;
    }

    if (projectId) {
      whereClause += ` AND e.project_id = $${paramIndex}`;
      params.push(projectId);
      paramIndex++;
    }

    if (costCenterId) {
      whereClause += ` AND e.cost_center_id = $${paramIndex}`;
      params.push(costCenterId);
      paramIndex++;
    }

    if (costType) {
      whereClause += ` AND e.cost_type = $${paramIndex}`;
      params.push(costType);
      paramIndex++;
    }

    const countResult = await db.query(
      `SELECT COUNT(*) AS total${fromClause}${whereClause}`,
      params
    );

    const result = await db.query(
      `${selectClause}${fromClause}${whereClause}
       ORDER BY e.date DESC, e.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    res.set('X-Total-Count', String(countResult.rows[0].total));
    res.json(result.rows);
  } catch (error) {
    console.error('Fetch pending expenses error:', error);
    res.status(500).json({ error: 'Server error fetching pending expenses' });
  }
});

// Legacy direct approve (admin/developer only).  This bypasses the org-chart
// approval chain, so it is restricted to administrators; the normal path is
// POST /api/expense-approvals/:id/approve, which also supports admin override.
router.post('/:id/approve', authMiddleware, isAdminOrDeveloper, async (req, res) => {
  try {
    // Get full expense details with user info
    const expenseQuery = await db.query(
      `SELECT e.*, u.first_name, u.last_name, u.email
       FROM expenses e
       JOIN users u ON e.user_id = u.id
       WHERE e.id = $1 AND e.status = 'pending'`,
      [req.params.id]
    );

    if (expenseQuery.rows.length === 0) {
      return res.status(404).json({ error: 'Expense not found or already processed' });
    }

    const expense = expenseQuery.rows[0];

    // Approve the expense (atomic update with status check to prevent race conditions)
    const result = await db.query(
      `UPDATE expenses
       SET status = 'approved',
           approved_by = $1,
           approved_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND status = 'pending'
       RETURNING *`,
      [req.user.id, req.params.id]
    );

    // If no rows updated, another request already approved it
    if (result.rows.length === 0) {
      return res.status(409).json({ error: 'Expense already approved by another request' });
    }

    const approvedExpense = { ...expense, ...result.rows[0] };

    // Auto-sync to Xero if connection exists (non-blocking)
    scheduleXeroAutoSync(approvedExpense.id);

    // Auto-send order to Amazon if expense has Amazon SPAID (non-blocking)
    if (approvedExpense.amazon_spaid && approvedExpense.amazon_order_status === 'pending') {
      setImmediate(async () => {
        try {
          console.log(`🛒 [Amazon Order] Placing order for expense ${approvedExpense.id} with SPAID:`, approvedExpense.amazon_spaid);

          // Atomic check: Mark as processing to prevent duplicate orders (race condition protection)
          const lockResult = await db.query(
            `UPDATE expenses
             SET amazon_order_status = 'processing',
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1 AND amazon_order_status = 'pending'
             RETURNING id`,
            [approvedExpense.id]
          );

          // If no rows updated, another request is already processing this order
          if (lockResult.rows.length === 0) {
            console.log(`⚠️  [Amazon Order] Expense ${approvedExpense.id} already being processed by another request. Skipping.`);
            return;
          }

          // Get location if expense has one
          let location = null;
          if (approvedExpense.location_id) {
            const locResult = await db.query('SELECT * FROM locations WHERE id = $1', [approvedExpense.location_id]);
            location = locResult.rows[0];
          }

          const orderResult = await sendOrderToAmazon(approvedExpense, {
            email: expense.email,
            name: `${expense.first_name} ${expense.last_name}`,
            location: location
          });

          if (orderResult.success) {
            console.log(`✓ [Amazon Order] Order placed successfully! PO Number: ${orderResult.poNumber}`);

            // Update expense with Amazon PO confirmation
            await db.query(
              `UPDATE expenses
               SET amazon_po_number = $1,
                   amazon_order_status = 'confirmed',
                   amazon_order_sent_at = CURRENT_TIMESTAMP,
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = $2`,
              [orderResult.poNumber, approvedExpense.id]
            );
          } else {
            const errorMsg = orderResult.error || orderResult.orderMessage || 'Unknown error';
            console.error(`✗ [Amazon Order] Failed to place order for expense ${approvedExpense.id}:`, errorMsg);
            console.error(`Amazon status code: ${orderResult.orderStatus}`);
            console.error(`Full error:`, orderResult);

            // Mark order as failed with error details
            await db.query(
              `UPDATE expenses
               SET amazon_order_status = 'failed',
                   amazon_order_sent_at = CURRENT_TIMESTAMP,
                   amazon_po_number = $1,
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = $2`,
              [`ERROR: ${errorMsg} (Status: ${orderResult.orderStatus || 'N/A'})`, approvedExpense.id]
            );
          }
        } catch (orderError) {
          console.error(`Error placing Amazon order for expense ${approvedExpense.id}:`, orderError);

          await db.query(
            `UPDATE expenses
             SET amazon_order_status = 'failed',
                 amazon_order_sent_at = CURRENT_TIMESTAMP,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [approvedExpense.id]
          );
        }
      });
    }

    // Respond immediately (don't wait for Xero sync or Amazon order)
    res.json({
      message: 'Expense approved successfully. Processing order placement and syncing to Xero in background.',
      expense: result.rows[0]
    });
  } catch (error) {
    console.error('Approve expense error:', error);
    res.status(500).json({ error: 'Server error approving expense' });
  }
});

// Legacy direct reject (admin/developer only) - see note on /:id/approve.
router.post('/:id/reject', authMiddleware, isAdminOrDeveloper, [
  body('reason').notEmpty().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { reason } = req.body;

    const result = await db.query(
      `UPDATE expenses 
       SET status = 'rejected',
           approved_by = $1,
           approved_at = CURRENT_TIMESTAMP,
           rejection_reason = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 AND status = 'pending'
       RETURNING *`,
      [req.user.id, reason, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Expense not found or already processed' });
    }

    res.json({
      message: 'Expense rejected',
      expense: result.rows[0]
    });
  } catch (error) {
    console.error('Reject expense error:', error);
    res.status(500).json({ error: 'Server error rejecting expense' });
  }
});

// Get expense analytics/summary
router.get('/analytics/summary', authMiddleware, async (req, res) => {
  try {
    const { startDate, endDate, locationId, projectId, costCenterId } = req.query;

    let query = `
      SELECT 
        COUNT(*) as total_count,
        COALESCE(SUM(amount), 0) as total_amount,
        COALESCE(AVG(amount), 0) as avg_amount,
        COALESCE(SUM(CASE WHEN cost_type = 'CAPEX' THEN amount ELSE 0 END), 0) as capex_total,
        COALESCE(SUM(CASE WHEN cost_type = 'OPEX' THEN amount ELSE 0 END), 0) as opex_total,
        COALESCE(SUM(CASE WHEN status = 'approved' THEN amount ELSE 0 END), 0) as approved_total,
        COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0) as pending_total,
        COALESCE(SUM(CASE WHEN status = 'rejected' THEN amount ELSE 0 END), 0) as rejected_total,
        COALESCE(SUM(CASE WHEN is_reimbursable THEN amount ELSE 0 END), 0) as reimbursable_total
      FROM expenses
      WHERE user_id = $1
    `;

    const params = [req.user.id];
    let paramIndex = 2;

    if (startDate) {
      query += ` AND date >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      query += ` AND date <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    if (locationId) {
      query += ` AND location_id = $${paramIndex}`;
      params.push(locationId);
      paramIndex++;
    }

    if (projectId) {
      query += ` AND project_id = $${paramIndex}`;
      params.push(projectId);
      paramIndex++;
    }

    if (costCenterId) {
      query += ` AND cost_center_id = $${paramIndex}`;
      params.push(costCenterId);
      paramIndex++;
    }

    const result = await db.query(query, params);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Fetch analytics error:', error);
    res.status(500).json({ error: 'Server error fetching analytics' });
  }
});

// Get expense breakdown by category
router.get('/analytics/by-category', authMiddleware, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    let query = `
      SELECT 
        category,
        COUNT(*) as count,
        COALESCE(SUM(amount), 0) as total_amount
      FROM expenses
      WHERE user_id = $1 AND status = 'approved'
    `;

    const params = [req.user.id];
    let paramIndex = 2;

    if (startDate) {
      query += ` AND date >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      query += ` AND date <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    query += ` GROUP BY category ORDER BY total_amount DESC`;

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Fetch category breakdown error:', error);
    res.status(500).json({ error: 'Server error fetching category breakdown' });
  }
});

// Admin endpoint to auto-approve stuck pending Amazon orders
// This is useful for orders that should have been auto-approved but weren't due to bugs
router.post('/admin/auto-approve-pending-amazon-orders', authMiddleware, isAdminOrDeveloper, async (req, res) => {
  try {
    const { userId } = req.body;

    console.log(`🔍 Admin: Searching for pending Amazon orders${userId ? ` for user ${userId}` : ''}...`);

    // Find all pending expenses with Amazon SPAID
    const query = userId
      ? `SELECT e.*, u.email, u.first_name, u.last_name, u.role
         FROM expenses e
         JOIN users u ON e.user_id = u.id
         WHERE e.user_id = $1 AND e.status = 'pending' AND e.amazon_spaid IS NOT NULL
         ORDER BY e.created_at DESC`
      : `SELECT e.*, u.email, u.first_name, u.last_name, u.role
         FROM expenses e
         JOIN users u ON e.user_id = u.id
         WHERE e.status = 'pending' AND e.amazon_spaid IS NOT NULL
         ORDER BY e.created_at DESC`;

    const params = userId ? [userId] : [];
    const result = await db.query(query, params);

    if (result.rows.length === 0) {
      return res.json({
        success: true,
        message: 'No pending Amazon orders found',
        processed: []
      });
    }

    console.log(`Found ${result.rows.length} pending Amazon order(s)`);

    const processed = [];

    for (const expense of result.rows) {
      try {
        console.log(`📦 Processing expense ${expense.id} - User: ${expense.first_name} ${expense.last_name} (${expense.role})`);

        // Update expense to approved status (with status check to prevent race conditions)
        const approveResult = await db.query(
          `UPDATE expenses
           SET status = 'approved',
               approved_by = $1,
               approved_at = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2 AND status = 'pending'
           RETURNING id`,
          [req.user.id, expense.id]
        );

        // If no rows updated, already approved by another request
        if (approveResult.rows.length === 0) {
          console.log(`⚠️  Expense ${expense.id} already approved. Skipping.`);
          processed.push({
            expenseId: expense.id,
            status: 'skipped',
            message: 'Already approved by another request'
          });
          continue;
        }

        console.log(`✓ Expense ${expense.id} approved`);

        // If it has Amazon SPAID and order is pending, send to Amazon
        if (expense.amazon_spaid && (!expense.amazon_order_status || expense.amazon_order_status === 'pending')) {
          console.log(`🛒 Sending order to Amazon for expense ${expense.id}...`);

          // Atomic lock to prevent duplicate orders
          const lockResult = await db.query(
            `UPDATE expenses
             SET amazon_order_status = 'processing',
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1 AND (amazon_order_status = 'pending' OR amazon_order_status IS NULL)
             RETURNING id`,
            [expense.id]
          );

          if (lockResult.rows.length === 0) {
            console.log(`⚠️  Expense ${expense.id} order already being processed. Skipping.`);
            processed.push({
              expenseId: expense.id,
              status: 'skipped',
              message: 'Order already being processed'
            });
            continue;
          }

          // Get location if expense has one
          let location = null;
          if (expense.location_id) {
            const locResult = await db.query('SELECT * FROM locations WHERE id = $1', [expense.location_id]);
            location = locResult.rows[0];
          }

          const orderResult = await sendOrderToAmazon(expense, {
            email: expense.email,
            name: `${expense.first_name} ${expense.last_name}`,
            location: location
          });

          if (orderResult.success) {
            console.log(`✓ Amazon order placed successfully! PO Number: ${orderResult.poNumber}`);

            // Update expense with Amazon PO confirmation
            await db.query(
              `UPDATE expenses
               SET amazon_po_number = $1,
                   amazon_order_status = 'confirmed',
                   amazon_order_sent_at = CURRENT_TIMESTAMP,
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = $2`,
              [orderResult.poNumber, expense.id]
            );

            processed.push({
              expenseId: expense.id,
              status: 'success',
              poNumber: orderResult.poNumber,
              message: 'Approved and sent to Amazon'
            });
          } else {
            console.error(`✗ Failed to place Amazon order for expense ${expense.id}:`, orderResult.error);

            // Mark order as failed
            await db.query(
              `UPDATE expenses
               SET amazon_order_status = 'failed',
                   amazon_order_sent_at = CURRENT_TIMESTAMP,
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = $1`,
              [expense.id]
            );

            processed.push({
              expenseId: expense.id,
              status: 'failed',
              error: orderResult.error,
              message: 'Approved but failed to send to Amazon'
            });
          }
        } else {
          processed.push({
            expenseId: expense.id,
            status: 'approved',
            message: 'Approved (no Amazon order to place)'
          });
        }
      } catch (error) {
        console.error(`✗ Error processing expense ${expense.id}:`, error.message);
        processed.push({
          expenseId: expense.id,
          status: 'error',
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      message: `Processed ${processed.length} expense(s)`,
      processed
    });
  } catch (error) {
    console.error('Admin auto-approve error:', error);
    res.status(500).json({ error: 'Server error auto-approving pending Amazon orders' });
  }
});

// Fix stuck admin/developer Amazon orders
// POST /api/expenses/fix-admin-dev-orders
router.post('/fix-admin-dev-orders', authMiddleware, isAdminOrDeveloper, async (req, res) => {
  try {
    console.log(`🔧 Fixing stuck admin/developer Amazon orders...`);

    // Find pending Amazon orders from admin/developer users only
    const query = `
      SELECT e.*, u.email, u.first_name, u.last_name, u.role
      FROM expenses e
      JOIN users u ON e.user_id = u.id
      WHERE e.status = 'pending'
        AND e.amazon_spaid IS NOT NULL
        AND u.role IN ('admin', 'developer')
      ORDER BY e.created_at DESC
    `;

    const result = await db.query(query);

    if (result.rows.length === 0) {
      return res.json({
        success: true,
        message: 'No stuck admin/developer Amazon orders found',
        processed: []
      });
    }

    console.log(`Found ${result.rows.length} stuck admin/developer order(s)`);

    const processed = [];

    for (const expense of result.rows) {
      try {
        console.log(`📦 Processing expense ${expense.id} - ${expense.role}: ${expense.first_name} ${expense.last_name}`);

        // Auto-approve (admin/developer bypass approval rules)
        const approveResult = await db.query(
          `UPDATE expenses
           SET status = 'approved',
               approved_by = $1,
               approved_at = CURRENT_TIMESTAMP,
               approval_chain = NULL,
               approval_rule_id = NULL,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2 AND status = 'pending'
           RETURNING id`,
          [req.user.id, expense.id]
        );

        if (approveResult.rows.length === 0) {
          console.log(`⚠️  Expense ${expense.id} already approved`);
          processed.push({
            expenseId: expense.id,
            status: 'skipped',
            message: 'Already approved'
          });
          continue;
        }

        console.log(`✓ Expense ${expense.id} auto-approved (${expense.role})`);

        // Send to Amazon if order is pending
        if (expense.amazon_order_status === 'pending' || !expense.amazon_order_status) {
          console.log(`🛒 Sending to Amazon...`);

          // Atomic lock
          const lockResult = await db.query(
            `UPDATE expenses
             SET amazon_order_status = 'processing',
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1 AND (amazon_order_status = 'pending' OR amazon_order_status IS NULL)
             RETURNING id`,
            [expense.id]
          );

          if (lockResult.rows.length === 0) {
            console.log(`⚠️  Order already being processed`);
            processed.push({
              expenseId: expense.id,
              status: 'skipped',
              message: 'Order already processing'
            });
            continue;
          }

          // Get location
          let location = null;
          if (expense.location_id) {
            const locResult = await db.query('SELECT * FROM locations WHERE id = $1', [expense.location_id]);
            location = locResult.rows[0];
          }

          const orderResult = await sendOrderToAmazon(expense, {
            email: expense.email,
            name: `${expense.first_name} ${expense.last_name}`,
            location: location
          });

          if (orderResult.success) {
            console.log(`✓ Amazon order placed! PO: ${orderResult.poNumber}`);

            await db.query(
              `UPDATE expenses
               SET amazon_po_number = $1,
                   amazon_order_status = 'confirmed',
                   amazon_order_sent_at = CURRENT_TIMESTAMP,
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = $2`,
              [orderResult.poNumber, expense.id]
            );

            processed.push({
              expenseId: expense.id,
              user: `${expense.first_name} ${expense.last_name}`,
              role: expense.role,
              status: 'success',
              poNumber: orderResult.poNumber
            });
          } else {
            console.error(`✗ Amazon order failed:`, orderResult.error);

            await db.query(
              `UPDATE expenses
               SET amazon_order_status = 'failed',
                   amazon_order_sent_at = CURRENT_TIMESTAMP,
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = $1`,
              [expense.id]
            );

            processed.push({
              expenseId: expense.id,
              user: `${expense.first_name} ${expense.last_name}`,
              role: expense.role,
              status: 'failed',
              error: orderResult.error
            });
          }
        } else {
          processed.push({
            expenseId: expense.id,
            user: `${expense.first_name} ${expense.last_name}`,
            role: expense.role,
            status: 'approved_only',
            message: `Order already ${expense.amazon_order_status || 'processed'}`
          });
        }
      } catch (error) {
        console.error(`Error processing expense ${expense.id}:`, error);
        processed.push({
          expenseId: expense.id,
          status: 'error',
          error: error.message
        });
      }
    }

    const successCount = processed.filter(p => p.status === 'success').length;
    const failCount = processed.filter(p => p.status === 'failed').length;

    res.json({
      success: true,
      message: `Fixed ${successCount} admin/developer orders (${failCount} failed)`,
      summary: {
        total: result.rows.length,
        success: successCount,
        failed: failCount,
        skipped: processed.filter(p => p.status === 'skipped').length
      },
      processed
    });
  } catch (error) {
    console.error('Fix admin/dev orders error:', error);
    res.status(500).json({ error: 'Server error fixing admin/developer orders' });
  }
});

module.exports = router;
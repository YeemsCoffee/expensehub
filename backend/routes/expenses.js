const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authMiddleware, isManagerOrAdmin } = require('../middleware/auth');
const { sendExpenseSubmissionNotification } = require('../services/emailService');
const xeroService = require('../services/xeroService');

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

// Get all expenses for current user with advanced filtering
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

    let query = `
      SELECT e.*, 
             cc.code as cost_center_code, cc.name as cost_center_name,
             l.code as location_code, l.name as location_name,
             p.code as project_code, p.name as project_name,
             u.first_name || ' ' || u.last_name as approved_by_name
      FROM expenses e
      LEFT JOIN cost_centers cc ON e.cost_center_id = cc.id
      LEFT JOIN locations l ON e.location_id = l.id
      LEFT JOIN projects p ON e.project_id = p.id
      LEFT JOIN users u ON e.approved_by = u.id
      WHERE e.user_id = $1
    `;

    const params = [req.user.id];
    let paramIndex = 2;

    if (status) {
      query += ` AND e.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (category) {
      query += ` AND e.category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    if (costType) {
      query += ` AND e.cost_type = $${paramIndex}`;
      params.push(costType);
      paramIndex++;
    }

    if (locationId) {
      query += ` AND e.location_id = $${paramIndex}`;
      params.push(locationId);
      paramIndex++;
    }

    if (projectId) {
      query += ` AND e.project_id = $${paramIndex}`;
      params.push(projectId);
      paramIndex++;
    }

    if (costCenterId) {
      query += ` AND e.cost_center_id = $${paramIndex}`;
      params.push(costCenterId);
      paramIndex++;
    }

    if (startDate) {
      query += ` AND e.date >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      query += ` AND e.date <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    if (minAmount) {
      query += ` AND e.amount >= $${paramIndex}`;
      params.push(minAmount);
      paramIndex++;
    }

    if (maxAmount) {
      query += ` AND e.amount <= $${paramIndex}`;
      params.push(maxAmount);
      paramIndex++;
    }

    query += ` ORDER BY e.date DESC, e.created_at DESC`;

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Fetch expenses error:', error);
    res.status(500).json({ error: 'Server error fetching expenses' });
  }
});

// Get single expense
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT e.*, 
              cc.code as cost_center_code, cc.name as cost_center_name,
              l.code as location_code, l.name as location_name,
              p.code as project_code, p.name as project_name,
              u.first_name || ' ' || u.last_name as approved_by_name
       FROM expenses e
       LEFT JOIN cost_centers cc ON e.cost_center_id = cc.id
       LEFT JOIN locations l ON e.location_id = l.id
       LEFT JOIN projects p ON e.project_id = p.id
       LEFT JOIN users u ON e.approved_by = u.id
       WHERE e.id = $1 AND e.user_id = $2`,
      [req.params.id, req.user.id]
    );

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
      locationId, projectId, costType, paymentMethod,
      vendorName, glAccount, notes, isReimbursable
    } = req.body;

    // Auto-determine cost type if not provided
    const finalCostType = costType || determineCostType(category, amount);

    // Find applicable approval rule based on amount
    const ruleResult = await db.query(
      'SELECT * FROM find_approval_rule($1, $2)',
      [amount, costCenterId]
    );

    let approvalChain = null;
    let approvalRuleId = null;
    let currentApprovalLevel = 1;

    if (ruleResult.rows[0] && ruleResult.rows[0].find_approval_rule) {
      approvalRuleId = ruleResult.rows[0].find_approval_rule;

      // Get the rule details
      const rule = await db.query(
        'SELECT * FROM approval_rules WHERE id = $1',
        [approvalRuleId]
      );

      if (rule.rows.length > 0) {
        const levelsRequired = rule.rows[0].levels_required;

        // Get manager chain from org chart
        const chainResult = await db.query(
          'SELECT * FROM get_manager_chain($1, $2)',
          [req.user.id, levelsRequired]
        );

        if (chainResult.rows.length > 0) {
          // Build approval chain
          approvalChain = chainResult.rows.map(row => ({
            level: row.level,
            user_id: row.manager_id,
            user_name: row.manager_name,
            user_email: row.manager_email,
            status: 'pending'
          }));
        } else {
          // No manager chain found - allow submission without approval
          // This allows employees without managers to still log expenses
          console.log(`No manager chain found for user ${req.user.id}. Expense will be submitted without approval requirements.`);
          approvalRuleId = null;
          approvalChain = null;
        }
      }
    }

    // Determine status: auto-approve if no approval chain required
    const status = approvalChain ? 'pending' : 'approved';
    const approvedAt = approvalChain ? null : new Date();

    const result = await db.query(
      `INSERT INTO expenses (
        user_id, cost_center_id, location_id, project_id,
        date, description, category, amount, subtotal, tax, tip, cost_type,
        payment_method, vendor_name, gl_account, notes, is_reimbursable,
        approval_rule_id, approval_chain, current_approval_level,
        status, approved_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
      RETURNING *`,
      [
        req.user.id, costCenterId, locationId, projectId,
        date, description, category, amount, subtotal, tax, tip, finalCostType,
        paymentMethod, vendorName, glAccount, notes, isReimbursable || false,
        approvalRuleId, approvalChain ? JSON.stringify(approvalChain) : null, currentApprovalLevel,
        status, approvedAt
      ]
    );

    // Send email notification to the first approver in the chain (non-blocking)
    if (approvalChain && approvalChain.length > 0) {
      const firstApprover = approvalChain[0];
      const expenseData = {
        id: result.rows[0].id,
        date: date,
        amount: amount,
        category: category,
        description: description,
        vendor_name: vendorName,
        notes: notes
      };
      const managerData = {
        name: firstApprover.user_name,
        email: firstApprover.user_email
      };
      const submitterData = {
        name: `${req.user.firstName} ${req.user.lastName}`
      };

      // Send email asynchronously without blocking the response
      sendExpenseSubmissionNotification(expenseData, managerData, submitterData)
        .catch(err => console.error('Failed to send email notification:', err));
    }

    res.status(201).json({
      message: 'Expense created successfully',
      expense: result.rows[0],
      approvalChain: approvalChain
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

    // Check if expense exists and belongs to user
    const checkResult = await db.query(
      'SELECT status FROM expenses WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    // Don't allow updates to approved/rejected expenses
    if (checkResult.rows[0].status !== 'pending') {
      return res.status(400).json({ error: 'Cannot update expense that has been approved or rejected' });
    }

    const { 
      date, description, category, amount, costCenterId,
      locationId, projectId, costType, paymentMethod,
      vendorName, glAccount, notes, isReimbursable
    } = req.body;

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
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $14 AND user_id = $15
       RETURNING *`,
      [
        date, description, category, amount, costCenterId,
        locationId, projectId, costType, paymentMethod,
        vendorName, glAccount, notes, isReimbursable,
        req.params.id, req.user.id
      ]
    );

    res.json({
      message: 'Expense updated successfully',
      expense: result.rows[0]
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
    // Check if expense exists and belongs to user
    const checkResult = await db.query(
      'SELECT status FROM expenses WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    // Don't allow deletion of approved expenses
    if (checkResult.rows[0].status === 'approved') {
      return res.status(400).json({ error: 'Cannot delete approved expense' });
    }

    await db.query(
      'DELETE FROM expenses WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );

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

    let query = `
      SELECT e.*, 
             u.first_name || ' ' || u.last_name as employee_name,
             u.employee_id,
             cc.code as cost_center_code, cc.name as cost_center_name,
             l.code as location_code, l.name as location_name,
             p.code as project_code, p.name as project_name
      FROM expenses e
      JOIN users u ON e.user_id = u.id
      LEFT JOIN cost_centers cc ON e.cost_center_id = cc.id
      LEFT JOIN locations l ON e.location_id = l.id
      LEFT JOIN projects p ON e.project_id = p.id
      WHERE e.status = 'pending'
    `;

    const params = [];
    let paramIndex = 1;

    if (locationId) {
      query += ` AND e.location_id = $${paramIndex}`;
      params.push(locationId);
      paramIndex++;
    }

    if (projectId) {
      query += ` AND e.project_id = $${paramIndex}`;
      params.push(projectId);
      paramIndex++;
    }

    if (costCenterId) {
      query += ` AND e.cost_center_id = $${paramIndex}`;
      params.push(costCenterId);
      paramIndex++;
    }

    if (costType) {
      query += ` AND e.cost_type = $${paramIndex}`;
      params.push(costType);
      paramIndex++;
    }

    query += ` ORDER BY e.date DESC, e.created_at DESC`;

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Fetch pending expenses error:', error);
    res.status(500).json({ error: 'Server error fetching pending expenses' });
  }
});

// Approve expense (with auto-sync to Xero)
router.post('/:id/approve', authMiddleware, isManagerOrAdmin, async (req, res) => {
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

    // Approve the expense
    const result = await db.query(
      `UPDATE expenses
       SET status = 'approved',
           approved_by = $1,
           approved_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [req.user.id, req.params.id]
    );

    const approvedExpense = { ...expense, ...result.rows[0] };

    // Auto-sync to Xero if connection exists (non-blocking)
    setImmediate(async () => {
      try {
        // Check if Xero is connected
        const xeroConnection = await db.query(
          `SELECT * FROM xero_connections
           WHERE is_organization_wide = true AND is_active = true
           LIMIT 1`
        );

        if (xeroConnection.rows.length === 0) {
          console.log(`Skipping Xero sync for expense ${approvedExpense.id} - No Xero connection`);
          return;
        }

        const connection = xeroConnection.rows[0];
        const tenantId = connection.tenant_id;

        // Refresh token if needed
        const expiresAt = new Date(connection.expires_at);
        const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);

        if (expiresAt <= fiveMinutesFromNow) {
          xeroService.xero.setTokenSet({ refresh_token: connection.refresh_token });
          const refreshResult = await xeroService.refreshAccessToken(connection.refresh_token);

          if (refreshResult.success) {
            await db.query(
              `UPDATE xero_connections
               SET access_token = $1, refresh_token = $2, expires_at = $3, updated_at = CURRENT_TIMESTAMP
               WHERE id = $4`,
              [
                refreshResult.tokenSet.access_token,
                refreshResult.tokenSet.refresh_token,
                new Date(Date.now() + refreshResult.tokenSet.expires_in * 1000),
                connection.id
              ]
            );
            connection.access_token = refreshResult.tokenSet.access_token;
          }
        }

        // Set access token
        xeroService.setAccessToken(connection.access_token);

        // Get account mappings
        const mappingsResult = await db.query(
          `SELECT category, xero_account_code
           FROM xero_account_mappings
           WHERE is_organization_wide = true AND tenant_id = $1`,
          [tenantId]
        );

        const mapping = {
          categoryMapping: {},
          defaultExpenseAccount: '400',
          defaultTaxType: 'NONE'
        };

        mappingsResult.rows.forEach(row => {
          mapping.categoryMapping[row.category] = row.xero_account_code;
        });

        // Sync to Xero (bills payable to employee for reimbursable, vendor for non-reimbursable)
        const syncResult = await xeroService.syncExpense(
          tenantId,
          approvedExpense,
          mapping
        );

        if (syncResult.success) {
          console.log(`✓ Auto-synced expense ${approvedExpense.id} to Xero`);
        } else {
          console.error(`✗ Failed to auto-sync expense ${approvedExpense.id}:`, syncResult.error);

          // Store sync error for manual retry (safety net)
          await db.query(
            `UPDATE expenses
             SET xero_sync_error = $1, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [syncResult.error, approvedExpense.id]
          );
        }
      } catch (syncError) {
        console.error(`Error during auto-sync for expense ${approvedExpense.id}:`, syncError);

        // Store sync error for manual retry (safety net)
        await db.query(
          `UPDATE expenses
           SET xero_sync_error = $1, updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [syncError.message, approvedExpense.id]
        );
      }
    });

    // Respond immediately (don't wait for Xero sync)
    res.json({
      message: 'Expense approved successfully. Syncing to Xero in background.',
      expense: result.rows[0]
    });
  } catch (error) {
    console.error('Approve expense error:', error);
    res.status(500).json({ error: 'Server error approving expense' });
  }
});

// Reject expense
router.post('/:id/reject', authMiddleware, isManagerOrAdmin, [
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

module.exports = router;
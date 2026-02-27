const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authMiddleware, isManagerOrAdmin, isAdminOrDeveloper } = require('../middleware/auth');

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
              p.budget, p.status, p.project_manager, p.cost_center_id, p.created_at, p.updated_at,
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

// ===== WBS ELEMENT ROUTES =====

// Get all WBS elements for a project
router.get('/:id/wbs', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      `SELECT wbs.id, wbs.project_id, wbs.code, wbs.category, wbs.description,
              wbs.budget_estimate, wbs.is_active, wbs.created_at, wbs.updated_at,
              COALESCE(SUM(e.amount), 0) as total_spent,
              COUNT(e.id) FILTER (WHERE e.id IS NOT NULL) as expense_count
       FROM project_wbs_elements wbs
       LEFT JOIN expenses e ON e.wbs_element_id = wbs.id AND e.status != 'rejected'
       WHERE wbs.project_id = $1 AND wbs.is_active = true
       GROUP BY wbs.id, wbs.project_id, wbs.code, wbs.category, wbs.description,
                wbs.budget_estimate, wbs.is_active, wbs.created_at, wbs.updated_at
       ORDER BY wbs.code`,
      [id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Fetch WBS elements error:', error);
    res.status(500).json({ error: 'Server error fetching WBS elements' });
  }
});

// Create WBS elements for a project (bulk creation)
router.post('/:id/wbs', authMiddleware, [
  body('elements').isArray({ min: 1 }),
  body('elements.*.category').notEmpty().trim(),
  body('elements.*.budgetEstimate').isFloat({ min: 0 }),
  body('elements.*.description').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { elements } = req.body;

    // Get project code
    const projectResult = await db.query(
      'SELECT code, status FROM projects WHERE id = $1',
      [id]
    );

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const projectCode = projectResult.rows[0].code;

    // Check if WBS elements already exist for this project
    const existingWbs = await db.query(
      'SELECT COUNT(*) as count FROM project_wbs_elements WHERE project_id = $1 AND is_active = true',
      [id]
    );

    if (existingWbs.rows[0].count > 0) {
      return res.status(400).json({
        error: 'WBS elements already exist for this project. Delete existing elements first.'
      });
    }

    // Create WBS elements
    const createdElements = [];
    for (let i = 0; i < elements.length; i++) {
      const element = elements[i];
      const categoryNumber = (i + 1).toString().padStart(2, '0');
      const wbsCode = `${projectCode}-${categoryNumber}`;

      const result = await db.query(
        `INSERT INTO project_wbs_elements (
          project_id, code, category, description, budget_estimate, is_active
        )
        VALUES ($1, $2, $3, $4, $5, true)
        RETURNING *`,
        [id, wbsCode, element.category, element.description || null, element.budgetEstimate]
      );

      createdElements.push(result.rows[0]);
    }

    res.status(201).json({
      message: 'WBS elements created successfully',
      elements: createdElements
    });
  } catch (error) {
    console.error('Create WBS elements error:', error);
    console.error('Error details:', error.message);
    console.error('Error code:', error.code);
    console.error('Error stack:', error.stack);

    if (error.code === '23505') { // Unique constraint violation
      return res.status(400).json({ error: 'WBS element code already exists' });
    }

    if (error.code === '42P01') { // Table does not exist
      return res.status(500).json({
        error: 'WBS elements table not found. Please run database migrations.',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }

    // Return detailed error in development mode
    const errorResponse = {
      error: 'Server error creating WBS elements',
      ...(process.env.NODE_ENV === 'development' && {
        details: error.message,
        code: error.code
      })
    };

    res.status(500).json(errorResponse);
  }
});

// Update a WBS element
router.put('/:id/wbs/:wbsId', authMiddleware, [
  body('category').optional().notEmpty().trim(),
  body('budgetEstimate').optional().isFloat({ min: 0 }),
  body('description').optional().trim(),
  body('isActive').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id, wbsId } = req.params;
    const { category, budgetEstimate, description, isActive } = req.body;

    // Verify WBS element belongs to project
    const checkResult = await db.query(
      'SELECT * FROM project_wbs_elements WHERE id = $1 AND project_id = $2',
      [wbsId, id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'WBS element not found' });
    }

    // Build update query dynamically
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (category !== undefined) {
      updates.push(`category = $${paramIndex++}`);
      values.push(category);
    }
    if (budgetEstimate !== undefined) {
      updates.push(`budget_estimate = $${paramIndex++}`);
      values.push(budgetEstimate);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(description);
    }
    if (isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(isActive);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(wbsId);

    const query = `
      UPDATE project_wbs_elements
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await db.query(query, values);

    res.json({
      message: 'WBS element updated successfully',
      element: result.rows[0]
    });
  } catch (error) {
    console.error('Update WBS element error:', error);
    res.status(500).json({ error: 'Server error updating WBS element' });
  }
});

// Delete a WBS element
router.delete('/:id/wbs/:wbsId', authMiddleware, async (req, res) => {
  try {
    const { id, wbsId } = req.params;

    // Verify WBS element belongs to project
    const checkResult = await db.query(
      'SELECT * FROM project_wbs_elements WHERE id = $1 AND project_id = $2',
      [wbsId, id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'WBS element not found' });
    }

    // Check if WBS element has any expenses
    const expenseCheck = await db.query(
      'SELECT COUNT(*) as count FROM expenses WHERE wbs_element_id = $1',
      [wbsId]
    );

    const expenseCount = parseInt(expenseCheck.rows[0].count);

    if (expenseCount > 0) {
      return res.status(400).json({
        error: `Cannot delete WBS element. It has ${expenseCount} expense(s) associated with it.`
      });
    }

    // Delete the WBS element
    await db.query('DELETE FROM project_wbs_elements WHERE id = $1', [wbsId]);

    res.json({
      message: 'WBS element deleted successfully',
      element: checkResult.rows[0]
    });
  } catch (error) {
    console.error('Delete WBS element error:', error);
    res.status(500).json({ error: 'Server error deleting WBS element' });
  }
});

// Get expenses for a specific WBS element
router.get('/:id/wbs/:wbsId/expenses', authMiddleware, isAdminOrDeveloper, async (req, res) => {
  try {
    const projectId = parseInt(req.params.id);
    const wbsId = parseInt(req.params.wbsId);
    const { status, startDate, endDate, minAmount, maxAmount } = req.query;

    // Verify project exists and user has access
    const projectResult = await pool.query(
      'SELECT * FROM projects WHERE id = $1',
      [projectId]
    );

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Verify WBS element belongs to this project
    const wbsResult = await pool.query(
      'SELECT * FROM project_wbs_elements WHERE id = $1 AND project_id = $2',
      [wbsId, projectId]
    );

    if (wbsResult.rows.length === 0) {
      return res.status(404).json({ error: 'WBS element not found for this project' });
    }

    // Build expenses query with filters
    let query = `
      SELECT e.*,
        u.first_name || ' ' || u.last_name as submitted_by_name,
        u.email as submitted_by_email,
        cc.code as cost_center_code,
        cc.name as cost_center_name,
        l.code as location_code,
        l.name as location_name,
        p.code as project_code,
        p.name as project_name,
        wbs.code as wbs_code,
        wbs.category as wbs_category,
        approver.first_name || ' ' || approver.last_name as approved_by_name
      FROM expenses e
      LEFT JOIN users u ON e.user_id = u.id
      LEFT JOIN cost_centers cc ON e.cost_center_id = cc.id
      LEFT JOIN locations l ON e.location_id = l.id
      LEFT JOIN projects p ON e.project_id = p.id
      LEFT JOIN project_wbs_elements wbs ON e.wbs_element_id = wbs.id
      LEFT JOIN users approver ON e.approved_by = approver.id
      WHERE e.wbs_element_id = $1
    `;

    const queryParams = [wbsId];
    let paramCount = 1;

    // Add filters
    if (status) {
      paramCount++;
      query += ` AND e.status = $${paramCount}`;
      queryParams.push(status);
    }

    if (startDate) {
      paramCount++;
      query += ` AND e.date >= $${paramCount}`;
      queryParams.push(startDate);
    }

    if (endDate) {
      paramCount++;
      query += ` AND e.date <= $${paramCount}`;
      queryParams.push(endDate);
    }

    if (minAmount) {
      paramCount++;
      query += ` AND e.amount >= $${paramCount}`;
      queryParams.push(parseFloat(minAmount));
    }

    if (maxAmount) {
      paramCount++;
      query += ` AND e.amount <= $${paramCount}`;
      queryParams.push(parseFloat(maxAmount));
    }

    query += ' ORDER BY e.date DESC, e.created_at DESC';

    const expensesResult = await pool.query(query, queryParams);

    // Calculate summary statistics
    const summaryQuery = `
      SELECT
        COUNT(*) as total_count,
        COALESCE(SUM(amount), 0) as total_amount,
        COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0) as pending_amount,
        COALESCE(SUM(CASE WHEN status = 'approved' THEN amount ELSE 0 END), 0) as approved_amount,
        COALESCE(SUM(CASE WHEN status = 'rejected' THEN amount ELSE 0 END), 0) as rejected_amount,
        COALESCE(SUM(CASE WHEN cost_type = 'OPEX' THEN amount ELSE 0 END), 0) as opex_amount,
        COALESCE(SUM(CASE WHEN cost_type = 'CAPEX' THEN amount ELSE 0 END), 0) as capex_amount
      FROM expenses
      WHERE wbs_element_id = $1
    `;

    const summaryResult = await pool.query(summaryQuery, [wbsId]);

    res.json({
      wbsElement: wbsResult.rows[0],
      expenses: expensesResult.rows,
      summary: summaryResult.rows[0]
    });
  } catch (error) {
    console.error('Get WBS expenses error:', error);
    res.status(500).json({ error: 'Server error fetching WBS expenses' });
  }
});

// Get project spend report
router.get('/:id/report', authMiddleware, isAdminOrDeveloper, async (req, res) => {
  try {
    const projectId = parseInt(req.params.id);
    const { format = 'json' } = req.query; // Support 'json' or 'csv'

    // Get project details
    const projectResult = await pool.query(
      'SELECT * FROM projects WHERE id = $1',
      [projectId]
    );

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const project = projectResult.rows[0];

    // Get overall project expense summary
    const overallSummaryQuery = `
      SELECT
        COUNT(*) as total_expenses,
        COALESCE(SUM(amount), 0) as total_spent,
        COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0) as pending_amount,
        COALESCE(SUM(CASE WHEN status = 'approved' THEN amount ELSE 0 END), 0) as approved_amount,
        COALESCE(SUM(CASE WHEN status = 'rejected' THEN amount ELSE 0 END), 0) as rejected_amount,
        COALESCE(SUM(CASE WHEN cost_type = 'OPEX' THEN amount ELSE 0 END), 0) as opex_amount,
        COALESCE(SUM(CASE WHEN cost_type = 'CAPEX' THEN amount ELSE 0 END), 0) as capex_amount,
        COALESCE(SUM(CASE WHEN is_reimbursable = true THEN amount ELSE 0 END), 0) as reimbursable_amount,
        COUNT(DISTINCT user_id) as unique_submitters
      FROM expenses
      WHERE project_id = $1
    `;

    const overallSummary = await pool.query(overallSummaryQuery, [projectId]);

    // Get WBS element breakdown
    const wbsBreakdownQuery = `
      SELECT
        wbs.id,
        wbs.code,
        wbs.category,
        wbs.description,
        wbs.budget_estimate,
        COUNT(e.id) as expense_count,
        COALESCE(SUM(CASE WHEN e.status != 'rejected' THEN e.amount ELSE 0 END), 0) as total_spent,
        COALESCE(SUM(CASE WHEN e.status = 'pending' THEN e.amount ELSE 0 END), 0) as pending_amount,
        COALESCE(SUM(CASE WHEN e.status = 'approved' THEN e.amount ELSE 0 END), 0) as approved_amount,
        COALESCE(SUM(CASE WHEN e.cost_type = 'OPEX' AND e.status != 'rejected' THEN e.amount ELSE 0 END), 0) as opex_amount,
        COALESCE(SUM(CASE WHEN e.cost_type = 'CAPEX' AND e.status != 'rejected' THEN e.amount ELSE 0 END), 0) as capex_amount,
        wbs.budget_estimate - COALESCE(SUM(CASE WHEN e.status != 'rejected' THEN e.amount ELSE 0 END), 0) as remaining_budget,
        CASE
          WHEN wbs.budget_estimate > 0 THEN
            (COALESCE(SUM(CASE WHEN e.status != 'rejected' THEN e.amount ELSE 0 END), 0) / wbs.budget_estimate * 100)
          ELSE 0
        END as budget_utilization_percentage
      FROM project_wbs_elements wbs
      LEFT JOIN expenses e ON e.wbs_element_id = wbs.id
      WHERE wbs.project_id = $1 AND wbs.is_active = true
      GROUP BY wbs.id, wbs.code, wbs.category, wbs.description, wbs.budget_estimate
      ORDER BY wbs.code
    `;

    const wbsBreakdown = await pool.query(wbsBreakdownQuery, [projectId]);

    // Get category breakdown
    const categoryBreakdownQuery = `
      SELECT
        category,
        COUNT(*) as expense_count,
        COALESCE(SUM(CASE WHEN status != 'rejected' THEN amount ELSE 0 END), 0) as total_amount,
        COALESCE(SUM(CASE WHEN status = 'approved' THEN amount ELSE 0 END), 0) as approved_amount
      FROM expenses
      WHERE project_id = $1
      GROUP BY category
      ORDER BY total_amount DESC
    `;

    const categoryBreakdown = await pool.query(categoryBreakdownQuery, [projectId]);

    // Get top submitters
    const topSubmittersQuery = `
      SELECT
        u.first_name || ' ' || u.last_name as submitter_name,
        u.email as submitter_email,
        COUNT(e.id) as expense_count,
        COALESCE(SUM(CASE WHEN e.status != 'rejected' THEN e.amount ELSE 0 END), 0) as total_amount
      FROM expenses e
      JOIN users u ON e.user_id = u.id
      WHERE e.project_id = $1
      GROUP BY u.id, u.first_name, u.last_name, u.email
      ORDER BY total_amount DESC
      LIMIT 10
    `;

    const topSubmitters = await pool.query(topSubmittersQuery, [projectId]);

    // Calculate total WBS budget
    const totalWbsBudget = wbsBreakdown.rows.reduce((sum, wbs) => sum + parseFloat(wbs.budget_estimate || 0), 0);

    const reportData = {
      project: {
        id: project.id,
        code: project.code,
        name: project.name,
        description: project.description,
        start_date: project.start_date,
        end_date: project.end_date,
        status: project.status,
        total_wbs_budget: totalWbsBudget
      },
      summary: {
        ...overallSummary.rows[0],
        budget_remaining: totalWbsBudget - parseFloat(overallSummary.rows[0].total_spent || 0),
        budget_utilization_percentage: totalWbsBudget > 0
          ? (parseFloat(overallSummary.rows[0].total_spent || 0) / totalWbsBudget * 100)
          : 0
      },
      wbsBreakdown: wbsBreakdown.rows,
      categoryBreakdown: categoryBreakdown.rows,
      topSubmitters: topSubmitters.rows,
      generatedAt: new Date().toISOString()
    };

    // Return as JSON or CSV
    if (format === 'csv') {
      // Generate CSV for WBS breakdown
      const csvHeader = 'WBS Code,Category,Description,Budget Estimate,Total Spent,Pending,Approved,OPEX,CAPEX,Remaining Budget,Utilization %\n';
      const csvRows = wbsBreakdown.rows.map(wbs =>
        `"${wbs.code}","${wbs.category}","${wbs.description || ''}",${wbs.budget_estimate},${wbs.total_spent},${wbs.pending_amount},${wbs.approved_amount},${wbs.opex_amount},${wbs.capex_amount},${wbs.remaining_budget},${parseFloat(wbs.budget_utilization_percentage).toFixed(2)}`
      ).join('\n');

      const csv = csvHeader + csvRows;

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="project-${project.code}-report-${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csv);
    } else {
      res.json(reportData);
    }
  } catch (error) {
    console.error('Get project report error:', error);
    res.status(500).json({ error: 'Server error generating project report' });
  }
});

module.exports = router;
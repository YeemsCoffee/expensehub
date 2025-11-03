const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authMiddleware, isAdmin } = require('../middleware/auth');

// Get all approval flows (admin only)
router.get('/', authMiddleware, isAdmin, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT af.*, 
             cc.code as cost_center_code, cc.name as cost_center_name
      FROM approval_flows af
      LEFT JOIN cost_centers cc ON af.cost_center_id = cc.id
      ORDER BY af.min_amount ASC, af.created_at DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Fetch approval flows error:', error);
    res.status(500).json({ error: 'Server error fetching approval flows' });
  }
});

// Get single approval flow
router.get('/:id', authMiddleware, isAdmin, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT af.*, 
              cc.code as cost_center_code, cc.name as cost_center_name
       FROM approval_flows af
       LEFT JOIN cost_centers cc ON af.cost_center_id = cc.id
       WHERE af.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Approval flow not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Fetch approval flow error:', error);
    res.status(500).json({ error: 'Server error fetching approval flow' });
  }
});

// Create new approval flow (admin only)
router.post('/', authMiddleware, isAdmin, [
  body('name').notEmpty().trim(),
  body('minAmount').isFloat({ min: 0 }),
  body('maxAmount').optional({ nullable: true }).isFloat({ min: 0 }),
  body('approvers').isArray({ min: 1 }),
  body('approvers.*').isInt(),
  body('isActive').optional().isBoolean(),
  body('costCenterId').optional({ nullable: true }).isInt()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { 
      name, description, minAmount, maxAmount, 
      costCenterId, isActive, approvers 
    } = req.body;

    // Check for overlapping amount ranges
    let overlapQuery = `
      SELECT id, name, min_amount, max_amount 
      FROM approval_flows 
      WHERE is_active = true
    `;
    
    const overlapParams = [];
    let paramIndex = 1;

    // Add cost center filter if specified
    if (costCenterId) {
      overlapQuery += ` AND (cost_center_id = $${paramIndex} OR cost_center_id IS NULL)`;
      overlapParams.push(costCenterId);
      paramIndex++;
    } else {
      overlapQuery += ` AND cost_center_id IS NULL`;
    }

    // Check for amount overlap
    if (maxAmount) {
      overlapQuery += ` AND (
        (min_amount <= $${paramIndex} AND (max_amount >= $${paramIndex} OR max_amount IS NULL))
        OR
        (min_amount <= $${paramIndex + 1} AND (max_amount >= $${paramIndex + 1} OR max_amount IS NULL))
        OR
        (min_amount >= $${paramIndex} AND max_amount <= $${paramIndex + 1})
      )`;
      overlapParams.push(minAmount, maxAmount);
    } else {
      overlapQuery += ` AND (max_amount >= $${paramIndex} OR max_amount IS NULL)`;
      overlapParams.push(minAmount);
    }

    const overlapResult = await db.query(overlapQuery, overlapParams);
    
    if (overlapResult.rows.length > 0) {
      return res.status(400).json({ 
        error: 'This amount range overlaps with existing approval flow: ' + overlapResult.rows[0].name 
      });
    }

    // Verify all approvers exist and have appropriate roles
    const approverCheck = await db.query(
      'SELECT id, role FROM users WHERE id = ANY($1)',
      [approvers]
    );

    if (approverCheck.rows.length !== approvers.length) {
      return res.status(400).json({ error: 'One or more approvers not found' });
    }

    const invalidApprovers = approverCheck.rows.filter(
      u => !['manager', 'admin'].includes(u.role)
    );

    if (invalidApprovers.length > 0) {
      return res.status(400).json({ 
        error: 'All approvers must be managers or admins' 
      });
    }

    // Create the approval flow
    const result = await db.query(
      `INSERT INTO approval_flows (
        name, description, min_amount, max_amount, 
        cost_center_id, is_active, approvers, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        name, description, minAmount, maxAmount,
        costCenterId, isActive !== false, approvers, req.user.id
      ]
    );

    res.status(201).json({
      message: 'Approval flow created successfully',
      approvalFlow: result.rows[0]
    });
  } catch (error) {
    console.error('Create approval flow error:', error);
    res.status(500).json({ error: 'Server error creating approval flow' });
  }
});

// Update approval flow (admin only)
router.put('/:id', authMiddleware, isAdmin, [
  body('name').optional().notEmpty().trim(),
  body('minAmount').optional().isFloat({ min: 0 }),
  body('maxAmount').optional({ nullable: true }).isFloat({ min: 0 }),
  body('approvers').optional().isArray({ min: 1 }),
  body('approvers.*').optional().isInt(),
  body('isActive').optional().isBoolean(),
  body('costCenterId').optional({ nullable: true }).isInt()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Check if approval flow exists
    const checkResult = await db.query(
      'SELECT * FROM approval_flows WHERE id = $1',
      [req.params.id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Approval flow not found' });
    }

    const existingFlow = checkResult.rows[0];
    const { 
      name, description, minAmount, maxAmount, 
      costCenterId, isActive, approvers 
    } = req.body;

    // Verify approvers if provided
    if (approvers && approvers.length > 0) {
      const approverCheck = await db.query(
        'SELECT id, role FROM users WHERE id = ANY($1)',
        [approvers]
      );

      if (approverCheck.rows.length !== approvers.length) {
        return res.status(400).json({ error: 'One or more approvers not found' });
      }

      const invalidApprovers = approverCheck.rows.filter(
        u => !['manager', 'admin'].includes(u.role)
      );

      if (invalidApprovers.length > 0) {
        return res.status(400).json({ 
          error: 'All approvers must be managers or admins' 
        });
      }
    }

    const result = await db.query(
      `UPDATE approval_flows 
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           min_amount = COALESCE($3, min_amount),
           max_amount = COALESCE($4, max_amount),
           cost_center_id = COALESCE($5, cost_center_id),
           is_active = COALESCE($6, is_active),
           approvers = COALESCE($7, approvers),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $8
       RETURNING *`,
      [
        name, description, minAmount, maxAmount,
        costCenterId, isActive, approvers, req.params.id
      ]
    );

    res.json({
      message: 'Approval flow updated successfully',
      approvalFlow: result.rows[0]
    });
  } catch (error) {
    console.error('Update approval flow error:', error);
    res.status(500).json({ error: 'Server error updating approval flow' });
  }
});

// Delete approval flow (admin only)
router.delete('/:id', authMiddleware, isAdmin, async (req, res) => {
  try {
    // Check if any expenses are using this flow
    const usageCheck = await db.query(
      'SELECT COUNT(*) as count FROM expense_approvals WHERE approval_flow_id = $1',
      [req.params.id]
    );

    if (parseInt(usageCheck.rows[0].count) > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete approval flow that is being used by expenses. Deactivate it instead.' 
      });
    }

    const result = await db.query(
      'DELETE FROM approval_flows WHERE id = $1 RETURNING id',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Approval flow not found' });
    }

    res.json({ message: 'Approval flow deleted successfully' });
  } catch (error) {
    console.error('Delete approval flow error:', error);
    res.status(500).json({ error: 'Server error deleting approval flow' });
  }
});

// Get applicable approval flow for an expense amount (helper endpoint)
router.get('/check/applicable', authMiddleware, async (req, res) => {
  try {
    const { amount, costCenterId } = req.query;

    if (!amount) {
      return res.status(400).json({ error: 'Amount is required' });
    }

    let query = `
      SELECT * FROM approval_flows
      WHERE is_active = true
      AND min_amount <= $1
      AND (max_amount >= $1 OR max_amount IS NULL)
    `;

    const params = [parseFloat(amount)];

    if (costCenterId) {
      query += ` AND (cost_center_id = $2 OR cost_center_id IS NULL)`;
      params.push(costCenterId);
      query += ` ORDER BY cost_center_id DESC NULLS LAST, min_amount DESC`;
    } else {
      query += ` AND cost_center_id IS NULL`;
      query += ` ORDER BY min_amount DESC`;
    }

    query += ` LIMIT 1`;

    const result = await db.query(query, params);

    if (result.rows.length === 0) {
      return res.json({ 
        requiresApproval: false,
        message: 'No approval flow applicable for this amount'
      });
    }

    res.json({
      requiresApproval: true,
      approvalFlow: result.rows[0]
    });
  } catch (error) {
    console.error('Check applicable flow error:', error);
    res.status(500).json({ error: 'Server error checking approval flow' });
  }
});

module.exports = router;
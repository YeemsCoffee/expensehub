const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authMiddleware } = require('../middleware/auth');

// Middleware to check if user is admin or developer
const isAdminOrDeveloper = (req, res, next) => {
  if (req.user.role !== 'admin' && req.user.role !== 'developer') {
    return res.status(403).json({ error: 'Access denied. Admin or developer rights required.' });
  }
  next();
};

// Get all approval rules
router.get('/', authMiddleware, isAdminOrDeveloper, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT ar.*,
             cc.code as cost_center_code, cc.name as cost_center_name
      FROM approval_rules ar
      LEFT JOIN cost_centers cc ON ar.cost_center_id = cc.id
      ORDER BY ar.min_amount ASC, ar.created_at DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Fetch approval rules error:', error);
    res.status(500).json({ error: 'Server error fetching approval rules' });
  }
});

// Get single approval rule
router.get('/:id', authMiddleware, isAdminOrDeveloper, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT ar.*,
              cc.code as cost_center_code, cc.name as cost_center_name
       FROM approval_rules ar
       LEFT JOIN cost_centers cc ON ar.cost_center_id = cc.id
       WHERE ar.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Approval rule not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Fetch approval rule error:', error);
    res.status(500).json({ error: 'Server error fetching approval rule' });
  }
});

// Create new approval rule
router.post('/', authMiddleware, isAdminOrDeveloper, [
  body('name').notEmpty().trim(),
  body('minAmount').isFloat({ min: 0 }),
  body('maxAmount').optional({ nullable: true }).isFloat({ min: 0 }),
  body('levelsRequired').isInt({ min: 1, max: 10 }),
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
      costCenterId, isActive, levelsRequired
    } = req.body;

    // Validate amount range
    if (maxAmount !== null && minAmount >= maxAmount) {
      return res.status(400).json({ error: 'Maximum amount must be greater than minimum amount' });
    }

    // Check for overlapping amount ranges
    let overlapQuery = `
      SELECT id, name, min_amount, max_amount
      FROM approval_rules
      WHERE is_active = true
    `;

    const overlapParams = [];
    let paramIndex = 1;

    // Add cost center filter
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
        error: 'This amount range overlaps with existing approval rule: ' + overlapResult.rows[0].name
      });
    }

    // Create the approval rule
    const result = await db.query(
      `INSERT INTO approval_rules (
        name, description, min_amount, max_amount,
        cost_center_id, is_active, levels_required, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        name, description, minAmount, maxAmount,
        costCenterId, isActive !== false, levelsRequired, req.user.id
      ]
    );

    res.status(201).json({
      message: 'Approval rule created successfully',
      approvalRule: result.rows[0]
    });
  } catch (error) {
    console.error('Create approval rule error:', error);
    res.status(500).json({ error: 'Server error creating approval rule' });
  }
});

// Update approval rule
router.put('/:id', authMiddleware, isAdminOrDeveloper, [
  body('name').optional().notEmpty().trim(),
  body('minAmount').optional().isFloat({ min: 0 }),
  body('maxAmount').optional({ nullable: true }).isFloat({ min: 0 }),
  body('levelsRequired').optional().isInt({ min: 1, max: 10 }),
  body('isActive').optional().isBoolean(),
  body('costCenterId').optional({ nullable: true }).isInt()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Check if approval rule exists
    const checkResult = await db.query(
      'SELECT * FROM approval_rules WHERE id = $1',
      [req.params.id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Approval rule not found' });
    }

    const {
      name, description, minAmount, maxAmount,
      costCenterId, isActive, levelsRequired
    } = req.body;

    // Validate amount range if both provided
    if (minAmount !== undefined && maxAmount !== undefined && maxAmount !== null && minAmount >= maxAmount) {
      return res.status(400).json({ error: 'Maximum amount must be greater than minimum amount' });
    }

    const result = await db.query(
      `UPDATE approval_rules
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           min_amount = COALESCE($3, min_amount),
           max_amount = COALESCE($4, max_amount),
           cost_center_id = COALESCE($5, cost_center_id),
           is_active = COALESCE($6, is_active),
           levels_required = COALESCE($7, levels_required),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $8
       RETURNING *`,
      [
        name, description, minAmount, maxAmount,
        costCenterId, isActive, levelsRequired, req.params.id
      ]
    );

    res.json({
      message: 'Approval rule updated successfully',
      approvalRule: result.rows[0]
    });
  } catch (error) {
    console.error('Update approval rule error:', error);
    res.status(500).json({ error: 'Server error updating approval rule' });
  }
});

// Delete approval rule
router.delete('/:id', authMiddleware, isAdminOrDeveloper, async (req, res) => {
  try {
    // Check if any expenses are using this rule
    const usageCheck = await db.query(
      'SELECT COUNT(*) as count FROM expenses WHERE approval_rule_id = $1',
      [req.params.id]
    );

    if (parseInt(usageCheck.rows[0].count) > 0) {
      return res.status(400).json({
        error: 'Cannot delete approval rule that is being used by expenses. Deactivate it instead.'
      });
    }

    const result = await db.query(
      'DELETE FROM approval_rules WHERE id = $1 RETURNING id',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Approval rule not found' });
    }

    res.json({ message: 'Approval rule deleted successfully' });
  } catch (error) {
    console.error('Delete approval rule error:', error);
    res.status(500).json({ error: 'Server error deleting approval rule' });
  }
});

// Preview approval chain for an expense
router.post('/preview-chain', authMiddleware, [
  body('amount').isFloat({ min: 0 }),
  body('costCenterId').optional({ nullable: true }).isInt()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { amount, costCenterId } = req.body;
    const userId = req.user.id;

    // Find applicable rule
    const ruleResult = await db.query(
      'SELECT * FROM find_approval_rule($1, $2)',
      [amount, costCenterId]
    );

    if (!ruleResult.rows[0] || !ruleResult.rows[0].find_approval_rule) {
      return res.json({
        requiresApproval: false,
        message: 'No approval required for this amount'
      });
    }

    const ruleId = ruleResult.rows[0].find_approval_rule;

    // Get the rule details
    const rule = await db.query(
      'SELECT * FROM approval_rules WHERE id = $1',
      [ruleId]
    );

    if (rule.rows.length === 0) {
      return res.status(404).json({ error: 'Approval rule not found' });
    }

    const levelsRequired = rule.rows[0].levels_required;

    // Get manager chain
    const chainResult = await db.query(
      'SELECT * FROM get_manager_chain($1, $2)',
      [userId, levelsRequired]
    );

    if (chainResult.rows.length === 0) {
      return res.json({
        requiresApproval: false,
        message: 'No managers found in your org chart hierarchy',
        error: 'Cannot determine approval chain - you may not have a manager assigned'
      });
    }

    res.json({
      requiresApproval: true,
      rule: rule.rows[0],
      approvalChain: chainResult.rows
    });
  } catch (error) {
    console.error('Preview approval chain error:', error);
    res.status(500).json({ error: 'Server error previewing approval chain' });
  }
});

module.exports = router;

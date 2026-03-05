const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authMiddleware, isManagerOrAdmin, isAdminOrDeveloper } = require('../middleware/auth');

// Get all active categories (all authenticated users)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { all } = req.query;
    const whereClause = all === 'true' ? '' : 'WHERE is_active = true';

    const result = await db.query(
      `SELECT id, name, xero_account_code, xero_account_name, is_active, display_order, created_at, updated_at
       FROM expense_categories
       ${whereClause}
       ORDER BY display_order ASC, name ASC`
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Fetch categories error:', error);
    res.status(500).json({ error: 'Server error fetching categories' });
  }
});

// Create a new category (admin/developer only)
router.post('/', authMiddleware, isAdminOrDeveloper, [
  body('name').notEmpty().trim(),
  body('xero_account_code').optional().trim(),
  body('xero_account_name').optional().trim(),
  body('display_order').optional().isInt({ min: 0 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, xero_account_code, xero_account_name, display_order } = req.body;

    // Check for duplicate name
    const existing = await db.query(
      'SELECT id FROM expense_categories WHERE LOWER(name) = LOWER($1)',
      [name]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'A category with this name already exists' });
    }

    // Get next display order if not provided
    let order = display_order;
    if (order === undefined || order === null) {
      const maxOrder = await db.query('SELECT COALESCE(MAX(display_order), 0) + 1 as next_order FROM expense_categories');
      order = maxOrder.rows[0].next_order;
    }

    const result = await db.query(
      `INSERT INTO expense_categories (name, xero_account_code, xero_account_name, is_active, display_order)
       VALUES ($1, $2, $3, true, $4)
       RETURNING *`,
      [name, xero_account_code || null, xero_account_name || null, order]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({ error: 'Server error creating category' });
  }
});

// Update a category (admin/developer only)
router.put('/:id', authMiddleware, isAdminOrDeveloper, [
  body('name').optional().trim(),
  body('xero_account_code').optional({ nullable: true }).trim(),
  body('xero_account_name').optional({ nullable: true }).trim(),
  body('is_active').optional().isBoolean(),
  body('display_order').optional().isInt({ min: 0 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { name, xero_account_code, xero_account_name, is_active, display_order } = req.body;

    // Check category exists
    const existing = await db.query('SELECT * FROM expense_categories WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // Check for duplicate name if name is being changed
    if (name && name.toLowerCase() !== existing.rows[0].name.toLowerCase()) {
      const duplicate = await db.query(
        'SELECT id FROM expense_categories WHERE LOWER(name) = LOWER($1) AND id != $2',
        [name, id]
      );
      if (duplicate.rows.length > 0) {
        return res.status(400).json({ error: 'A category with this name already exists' });
      }
    }

    const result = await db.query(
      `UPDATE expense_categories
       SET name = COALESCE($1, name),
           xero_account_code = $2,
           xero_account_name = $3,
           is_active = COALESCE($4, is_active),
           display_order = COALESCE($5, display_order),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING *`,
      [
        name || existing.rows[0].name,
        xero_account_code !== undefined ? xero_account_code : existing.rows[0].xero_account_code,
        xero_account_name !== undefined ? xero_account_name : existing.rows[0].xero_account_name,
        is_active,
        display_order,
        id
      ]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update category error:', error);
    res.status(500).json({ error: 'Server error updating category' });
  }
});

// Delete a category (admin/developer only)
router.delete('/:id', authMiddleware, isAdminOrDeveloper, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if any expenses use this category
    const category = await db.query('SELECT name FROM expense_categories WHERE id = $1', [id]);
    if (category.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const expenseCount = await db.query(
      'SELECT COUNT(*) as count FROM expenses WHERE category = $1',
      [category.rows[0].name]
    );

    if (parseInt(expenseCount.rows[0].count) > 0) {
      return res.status(400).json({
        error: `Cannot delete category "${category.rows[0].name}" - it has ${expenseCount.rows[0].count} expense(s). Deactivate it instead.`
      });
    }

    await db.query('DELETE FROM expense_categories WHERE id = $1', [id]);
    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({ error: 'Server error deleting category' });
  }
});

// Initialize categories table (run migration)
router.post('/initialize', authMiddleware, isAdminOrDeveloper, async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const migrationPath = path.join(__dirname, '..', 'database', 'create_expense_categories.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    await db.query(sql);
    res.json({ message: 'Expense categories initialized successfully' });
  } catch (error) {
    console.error('Initialize categories error:', error);
    res.status(500).json({ error: 'Server error initializing categories' });
  }
});

module.exports = router;

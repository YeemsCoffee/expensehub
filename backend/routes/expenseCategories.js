const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authMiddleware, isManagerOrAdmin, isAdminOrDeveloper } = require('../middleware/auth');

// Get all active categories (all authenticated users), each with its
// sub-categories. ?all=true includes inactive ones (for the admin page).
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { all } = req.query;
    const includeInactive = all === 'true';
    const whereClause = includeInactive ? '' : 'WHERE is_active = true';

    const [result, subResult] = await Promise.all([
      db.query(
        `SELECT id, name, xero_account_code, xero_account_name, is_active, display_order, created_at, updated_at
         FROM expense_categories
         ${whereClause}
         ORDER BY display_order ASC, name ASC`
      ),
      // Before the sub-categories migration has run there are none
      db.query(
        `SELECT id, category_id, name, is_active, display_order
         FROM expense_subcategories
         ${includeInactive ? '' : 'WHERE is_active = true'}
         ORDER BY display_order ASC, LOWER(name) ASC`
      ).catch(() => ({ rows: [] }))
    ]);

    const byCategory = new Map();
    for (const sub of subResult.rows) {
      if (!byCategory.has(sub.category_id)) byCategory.set(sub.category_id, []);
      byCategory.get(sub.category_id).push(sub);
    }

    res.json(result.rows.map((c) => ({ ...c, subcategories: byCategory.get(c.id) || [] })));
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

    // Xero mappings saved for its sub-categories go with them
    await db.query(
      `DELETE FROM xero_account_mappings
       WHERE category IN (SELECT 'sub:' || id FROM expense_subcategories WHERE category_id = $1)`,
      [id]
    ).catch(() => {});
    await db.query('DELETE FROM expense_categories WHERE id = $1', [id]);
    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({ error: 'Server error deleting category' });
  }
});

// ---------------------------------------------------------------------------
// Sub-categories (admin/developer only)
// ---------------------------------------------------------------------------

const cleanName = (value) => String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
const isId = (value) => /^\d+$/.test(String(value));

// Create a sub-category under a category
router.post('/:id/subcategories', authMiddleware, isAdminOrDeveloper, async (req, res) => {
  const name = cleanName(req.body && req.body.name);
  if (!name) return res.status(400).json({ error: 'Sub-category name is required' });
  if (name.length > 100) return res.status(400).json({ error: 'Sub-category name is too long' });

  if (!isId(req.params.id)) return res.status(404).json({ error: 'Category not found' });

  try {
    const category = await db.query('SELECT id, name FROM expense_categories WHERE id = $1', [req.params.id]);
    if (category.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const order = await db.query(
      'SELECT COALESCE(MAX(display_order), 0) + 1 AS next_order FROM expense_subcategories WHERE category_id = $1',
      [req.params.id]
    );
    const result = await db.query(
      `INSERT INTO expense_subcategories (category_id, name, display_order)
       VALUES ($1, $2, $3)
       RETURNING id, category_id, name, is_active, display_order`,
      [req.params.id, name, order.rows[0].next_order]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: `"${name}" already exists in this category` });
    }
    console.error('Create sub-category error:', error);
    res.status(500).json({ error: 'Server error creating sub-category' });
  }
});

// Rename, (de)activate or reorder a sub-category
router.put('/subcategories/:subId', authMiddleware, isAdminOrDeveloper, [
  body('is_active').optional().isBoolean(),
  body('display_order').optional().isInt({ min: 0 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  if (!isId(req.params.subId)) return res.status(404).json({ error: 'Sub-category not found' });
  const name = req.body.name !== undefined ? cleanName(req.body.name) : undefined;
  if (name !== undefined && !name) return res.status(400).json({ error: 'Sub-category name is required' });
  if (name && name.length > 100) return res.status(400).json({ error: 'Sub-category name is too long' });

  try {
    const result = await db.query(
      `UPDATE expense_subcategories
       SET name = COALESCE($1, name),
           is_active = COALESCE($2, is_active),
           display_order = COALESCE($3, display_order),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING id, category_id, name, is_active, display_order`,
      [name ?? null, req.body.is_active ?? null, req.body.display_order ?? null, req.params.subId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Sub-category not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: `"${name}" already exists in this category` });
    }
    console.error('Update sub-category error:', error);
    res.status(500).json({ error: 'Server error updating sub-category' });
  }
});

// Delete a sub-category no expense uses (otherwise deactivate it)
router.delete('/subcategories/:subId', authMiddleware, isAdminOrDeveloper, async (req, res) => {
  if (!isId(req.params.subId)) return res.status(404).json({ error: 'Sub-category not found' });
  try {
    const sub = await db.query('SELECT id, name FROM expense_subcategories WHERE id = $1', [req.params.subId]);
    if (sub.rows.length === 0) {
      return res.status(404).json({ error: 'Sub-category not found' });
    }

    const used = await db.query(
      'SELECT COUNT(*)::int AS count FROM expenses WHERE subcategory_id = $1',
      [req.params.subId]
    );
    if (used.rows[0].count > 0) {
      return res.status(400).json({
        error: `Cannot delete "${sub.rows[0].name}" - it has ${used.rows[0].count} expense(s). Deactivate it instead.`
      });
    }

    await db.query('DELETE FROM expense_subcategories WHERE id = $1', [req.params.subId]);
    // Its Xero account mappings (saved under "sub:<id>") are no longer reachable
    await db.query('DELETE FROM xero_account_mappings WHERE category = $1', [`sub:${req.params.subId}`])
      .catch(() => {});
    res.json({ message: 'Sub-category deleted' });
  } catch (error) {
    console.error('Delete sub-category error:', error);
    res.status(500).json({ error: 'Server error deleting sub-category' });
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

const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authMiddleware } = require('../middleware/auth');

// Get all active cost centers
router.get('/', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, code, name, budget, department, is_active
       FROM cost_centers
       WHERE is_active = true
       ORDER BY code`
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Fetch cost centers error:', error);
    res.status(500).json({ error: 'Server error fetching cost centers' });
  }
});

// Get single cost center
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, code, name, budget, department, is_active, created_at
       FROM cost_centers
       WHERE id = $1 AND is_active = true`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Cost center not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Fetch cost center error:', error);
    res.status(500).json({ error: 'Server error fetching cost center' });
  }
});

// Create new cost center
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { code, name, budget, department } = req.body;

    // Validation - only code and name required
    if (!code || !name) {
      return res.status(400).json({ error: 'Code and name are required' });
    }

    // Check if code already exists
    const existingResult = await db.query(
      'SELECT id FROM cost_centers WHERE code = $1',
      [code]
    );

    if (existingResult.rows.length > 0) {
      return res.status(400).json({ error: 'Cost center code already exists' });
    }

    // Create cost center (budget is optional, defaults to 0)
    const result = await db.query(
      `INSERT INTO cost_centers (code, name, budget, department, is_active)
       VALUES ($1, $2, $3, $4, true)
       RETURNING id, code, name, budget, department, is_active, created_at`,
      [code, name, budget || 0, department || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create cost center error:', error);
    res.status(500).json({ error: 'Server error creating cost center' });
  }
});

// Update cost center
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { name, budget, department } = req.body;
    const { id } = req.params;

    // Validation
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    // Check if cost center exists
    const existingResult = await db.query(
      'SELECT id FROM cost_centers WHERE id = $1',
      [id]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Cost center not found' });
    }

    // Update cost center (code cannot be changed)
    const result = await db.query(
      `UPDATE cost_centers 
       SET name = $1, budget = $2, department = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING id, code, name, budget, department, is_active, updated_at`,
      [name, budget || 0, department || null, id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update cost center error:', error);
    res.status(500).json({ error: 'Server error updating cost center' });
  }
});

// Delete cost center (hard delete from database)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if cost center exists
    const existingResult = await db.query(
      'SELECT id FROM cost_centers WHERE id = $1',
      [id]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Cost center not found' });
    }

    // Check if any expenses reference this cost center
    const expensesResult = await db.query(
      'SELECT COUNT(*) as count FROM expenses WHERE cost_center_id = $1',
      [id]
    );

    if (expensesResult.rows[0].count > 0) {
      return res.status(400).json({
        error: 'Cannot delete cost center that has expenses associated with it',
        details: `This cost center has ${expensesResult.rows[0].count} expense(s) associated with it. Please reassign those expenses before deleting.`
      });
    }

    // Hard delete from database
    await db.query(
      'DELETE FROM cost_centers WHERE id = $1',
      [id]
    );

    res.json({ message: 'Cost center deleted successfully' });
  } catch (error) {
    console.error('Delete cost center error:', error);
    res.status(500).json({ error: 'Server error deleting cost center' });
  }
});

module.exports = router;
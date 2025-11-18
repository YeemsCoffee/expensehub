const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authMiddleware, isManagerOrAdmin } = require('../middleware/auth');

// Get all active locations
router.get('/', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, code, name, address, city, state, zip_code, country, created_at
       FROM locations
       WHERE is_active = true
       ORDER BY code`
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Fetch locations error:', error);
    res.status(500).json({ error: 'Server error fetching locations' });
  }
});

// Get single location
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, code, name, address, city, state, country, created_at
       FROM locations 
       WHERE id = $1 AND is_active = true`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Location not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Fetch location error:', error);
    res.status(500).json({ error: 'Server error fetching location' });
  }
});

// Create new location
router.post('/', authMiddleware, isManagerOrAdmin, [
  body('code').notEmpty().trim(),
  body('name').notEmpty().trim(),
  body('address').optional().trim(),
  body('city').optional().trim(),
  body('state').optional().trim(),
  body('zipCode').optional().trim(),
  body('country').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { code, name, address, city, state, zipCode, country } = req.body;

    // Check if code already exists (only check active locations)
    const existingResult = await db.query(
      'SELECT id FROM locations WHERE code = $1 AND is_active = true',
      [code]
    );

    if (existingResult.rows.length > 0) {
      return res.status(400).json({ error: 'Location code already exists' });
    }

    // Create location
    const result = await db.query(
      `INSERT INTO locations (code, name, address, city, state, zip_code, country, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true)
       RETURNING id, code, name, address, city, state, zip_code, country, is_active, created_at`,
      [code, name, address, city, state, zipCode, country || 'USA']
    );

    res.status(201).json({
      message: 'Location created successfully',
      location: result.rows[0]
    });
  } catch (error) {
    console.error('Create location error:', error);
    res.status(500).json({ error: 'Server error creating location' });
  }
});

// Update location
router.put('/:id', authMiddleware, isManagerOrAdmin, [
  body('name').optional().trim(),
  body('address').optional().trim(),
  body('city').optional().trim(),
  body('state').optional().trim(),
  body('zipCode').optional().trim(),
  body('country').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, address, city, state, zipCode, country } = req.body;
    const { id } = req.params;

    // Check if location exists
    const existingResult = await db.query(
      'SELECT id FROM locations WHERE id = $1',
      [id]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Location not found' });
    }

    // Update location (code cannot be changed)
    const result = await db.query(
      `UPDATE locations
       SET name = COALESCE($1, name),
           address = COALESCE($2, address),
           city = COALESCE($3, city),
           state = COALESCE($4, state),
           zip_code = COALESCE($5, zip_code),
           country = COALESCE($6, country),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7
       RETURNING id, code, name, address, city, state, zip_code, country, is_active, updated_at`,
      [name, address, city, state, zipCode, country, id]
    );

    res.json({
      message: 'Location updated successfully',
      location: result.rows[0]
    });
  } catch (error) {
    console.error('Update location error:', error);
    res.status(500).json({ error: 'Server error updating location' });
  }
});

// Delete (deactivate) location
router.delete('/:id', authMiddleware, isManagerOrAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if location exists
    const existingResult = await db.query(
      'SELECT id FROM locations WHERE id = $1',
      [id]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Location not found' });
    }

    // Soft delete - set is_active to false
    await db.query(
      'UPDATE locations SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [id]
    );

    res.json({ message: 'Location deleted successfully' });
  } catch (error) {
    console.error('Delete location error:', error);
    res.status(500).json({ error: 'Server error deleting location' });
  }
});

// Get location statistics
router.get('/:id/stats', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      `SELECT 
         COUNT(*) as expense_count,
         COALESCE(SUM(amount), 0) as total_amount,
         COALESCE(AVG(amount), 0) as avg_amount
       FROM expenses
       WHERE location_id = $1 AND status = 'approved'`,
      [id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Fetch location stats error:', error);
    res.status(500).json({ error: 'Server error fetching location statistics' });
  }
});

module.exports = router;
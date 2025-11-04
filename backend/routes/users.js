const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
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

// Get all users (admin/developer only)
router.get('/', authMiddleware, isAdminOrDeveloper, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, email, first_name, last_name, employee_id, department, role, is_active, created_at
       FROM users
       ORDER BY created_at DESC`
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Fetch users error:', error);
    res.status(500).json({ error: 'Server error fetching users' });
  }
});

// Create new user (admin/developer only)
router.post('/', authMiddleware, isAdminOrDeveloper, [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('firstName').notEmpty().trim(),
  body('lastName').notEmpty().trim(),
  body('employeeId').notEmpty().trim(),
  body('role').isIn(['employee', 'manager', 'admin', 'developer'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, firstName, lastName, employeeId, department, role } = req.body;

    // Check if user already exists
    const userExists = await db.query(
      'SELECT id FROM users WHERE email = $1 OR employee_id = $2',
      [email, employeeId]
    );

    if (userExists.rows.length > 0) {
      return res.status(400).json({ error: 'User with this email or employee ID already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Create user
    const result = await db.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, employee_id, department, role)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, email, first_name, last_name, employee_id, department, role, created_at`,
      [email, passwordHash, firstName, lastName, employeeId, department || null, role]
    );

    const user = result.rows[0];

    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        employeeId: user.employee_id,
        department: user.department,
        role: user.role,
        createdAt: user.created_at
      }
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Server error creating user' });
  }
});

// Update user role (admin/developer only)
router.put('/:id/role', authMiddleware, isAdminOrDeveloper, [
  body('role').isIn(['employee', 'manager', 'admin', 'developer'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { role } = req.body;

    const result = await db.query(
      `UPDATE users
       SET role = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, email, first_name, last_name, employee_id, department, role`,
      [role, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    res.json({
      message: 'User role updated successfully',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        employeeId: user.employee_id,
        department: user.department,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Update user role error:', error);
    res.status(500).json({ error: 'Server error updating user role' });
  }
});

// Delete user (admin/developer only)
router.delete('/:id', authMiddleware, isAdminOrDeveloper, async (req, res) => {
  try {
    // Prevent deleting yourself
    if (parseInt(req.params.id) === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    // Check if user has expenses
    const expensesCheck = await db.query(
      'SELECT COUNT(*) as count FROM expenses WHERE user_id = $1',
      [req.params.id]
    );

    if (parseInt(expensesCheck.rows[0].count) > 0) {
      return res.status(400).json({
        error: 'Cannot delete user with existing expenses. Consider deactivating instead.'
      });
    }

    const result = await db.query(
      'DELETE FROM users WHERE id = $1 RETURNING id',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Server error deleting user' });
  }
});

// Deactivate/Activate user (admin/developer only)
router.put('/:id/active', authMiddleware, isAdminOrDeveloper, [
  body('isActive').isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { isActive } = req.body;

    // Prevent deactivating yourself
    if (parseInt(req.params.id) === req.user.id) {
      return res.status(400).json({ error: 'Cannot deactivate your own account' });
    }

    const result = await db.query(
      `UPDATE users
       SET is_active = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, email, first_name, last_name, is_active`,
      [isActive, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Update user active status error:', error);
    res.status(500).json({ error: 'Server error updating user status' });
  }
});

module.exports = router;

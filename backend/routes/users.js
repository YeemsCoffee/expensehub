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
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    // Soft-deleted users are hidden from the list (see DELETE /:id)
    const countResult = await db.query('SELECT COUNT(*) AS total FROM users WHERE deleted_at IS NULL');

    const result = await db.query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.employee_id,
              u.department, u.role, u.is_active, u.created_at, u.manager_id,
              m.first_name || ' ' || m.last_name as manager_name
       FROM users u
       LEFT JOIN users m ON u.manager_id = m.id
       WHERE u.deleted_at IS NULL
       ORDER BY u.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    res.set('X-Total-Count', String(countResult.rows[0].total));
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
  body('role').isIn(['employee', 'manager', 'admin', 'developer']),
  body('managerId').optional({ nullable: true }).isInt()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, firstName, lastName, employeeId, department, role, managerId } = req.body;

    // Check if user already exists
    const userExists = await db.query(
      'SELECT id FROM users WHERE email = $1 OR employee_id = $2',
      [email, employeeId]
    );

    if (userExists.rows.length > 0) {
      return res.status(400).json({ error: 'User with this email or employee ID already exists' });
    }

    // A manager must be able to act on approvals (same rule as PUT /:id/manager)
    if (managerId) {
      const managerCheck = await db.query(
        'SELECT role, is_active FROM users WHERE id = $1',
        [managerId]
      );
      if (managerCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Manager not found' });
      }
      if (!managerCheck.rows[0].is_active) {
        return res.status(400).json({ error: 'Selected manager is inactive' });
      }
      if (!['manager', 'admin', 'developer'].includes(managerCheck.rows[0].role)) {
        return res.status(400).json({ error: 'Selected user must have manager, admin, or developer role' });
      }
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Create user
    const result = await db.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, employee_id, department, role, manager_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, email, first_name, last_name, employee_id, department, role, manager_id, created_at`,
      [email, passwordHash, firstName, lastName, employeeId, department || null, role, managerId || null]
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

// Update user details - name and department (admin/developer only)
router.put('/:id', authMiddleware, isAdminOrDeveloper, [
  body('firstName').optional().trim().notEmpty().withMessage('First name cannot be empty'),
  body('lastName').optional().trim().notEmpty().withMessage('Last name cannot be empty'),
  body('department').optional({ nullable: true }).trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { firstName, lastName, department } = req.body;

    if (firstName === undefined && lastName === undefined && department === undefined) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    const result = await db.query(
      `UPDATE users
       SET first_name = COALESCE($1, first_name),
           last_name = COALESCE($2, last_name),
           department = CASE WHEN $3::boolean THEN NULLIF($4, '') ELSE department END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5 AND deleted_at IS NULL
       RETURNING id, email, first_name, last_name, employee_id, department, role`,
      [
        firstName ?? null,
        lastName ?? null,
        department !== undefined, // whether to touch department at all
        department ?? null,
        req.params.id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    res.json({
      message: 'User updated successfully',
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
    console.error('Update user details error:', error);
    res.status(500).json({ error: 'Server error updating user' });
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

// Update user's manager (admin/developer only)
router.put('/:id/manager', authMiddleware, isAdminOrDeveloper, [
  body('managerId').optional({ nullable: true }).isInt()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { managerId } = req.body;

    // Validate manager exists, is active and not deleted, and can approve
    if (managerId) {
      const managerCheck = await db.query(
        'SELECT role, is_active FROM users WHERE id = $1 AND deleted_at IS NULL',
        [managerId]
      );

      if (managerCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Manager not found' });
      }

      if (!managerCheck.rows[0].is_active) {
        return res.status(400).json({ error: 'Selected manager is inactive' });
      }

      const validRoles = ['manager', 'admin', 'developer'];
      if (!validRoles.includes(managerCheck.rows[0].role)) {
        return res.status(400).json({ error: 'Selected user must have manager, admin, or developer role' });
      }
    }

    const result = await db.query(
      `UPDATE users
       SET manager_id = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id`,
      [managerId, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'Manager updated successfully' });
  } catch (error) {
    console.error('Update user manager error:', error);
    res.status(500).json({ error: 'Server error updating manager' });
  }
});

// Delete user (admin/developer only)
//
// This is a soft delete: the row is kept so every expense, approval, document
// and audit record that references the user stays valid, but the user is
// deactivated, hidden from the list, and their PII anonymised so the email and
// employee ID can be reused. A hard DELETE cannot work "regardless" here -
// 20+ foreign keys reference users(id) without ON DELETE rules, and the one
// that cascades (expenses.user_id) would erase approved expenses, Amazon POs
// and Xero bills.
router.delete('/:id', authMiddleware, isAdminOrDeveloper, async (req, res) => {
  // Prevent deleting yourself (you'd lock yourself out mid-session)
  if (parseInt(req.params.id, 10) === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // Detach anyone who reported to this user so approval routing never
    // points at a deleted manager (approvalService then routes to admins).
    const reports = await client.query(
      `UPDATE users
       SET manager_id = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE manager_id = $1 AND deleted_at IS NULL
       RETURNING id`,
      [req.params.id]
    );

    // Count history we are keeping, to report back
    const history = await client.query(
      `SELECT
         (SELECT COUNT(*) FROM expenses WHERE user_id = $1) AS submitted,
         (SELECT COUNT(*) FROM expenses WHERE approved_by = $1) AS approved`,
      [req.params.id]
    );

    const result = await client.query(
      `UPDATE users
       SET is_active = false,
           deleted_at = CURRENT_TIMESTAMP,
           first_name = 'Deleted',
           last_name = 'User',
           email = 'deleted-' || id || '@removed.local',
           employee_id = 'DELETED-' || id,
           manager_id = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'User not found' });
    }

    await client.query('COMMIT');

    res.json({
      message: 'User deleted successfully',
      reportsReassigned: reports.rows.length,
      preserved: {
        expensesSubmitted: parseInt(history.rows[0].submitted, 10),
        expensesApproved: parseInt(history.rows[0].approved, 10)
      }
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Server error deleting user' });
  } finally {
    client.release();
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

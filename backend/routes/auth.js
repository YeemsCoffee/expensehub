const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authMiddleware } = require('../middleware/auth');
const { sendPasswordResetEmail } = require('../services/emailService');

// Rate limiter for password reset requests
// Limits: 5 requests per 15 minutes per IP
const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: 'Too many password reset attempts. Please try again later.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Register new user
router.post('/register', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('firstName').notEmpty().trim(),
  body('lastName').notEmpty().trim(),
  body('employeeId').notEmpty().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, firstName, lastName, employeeId } = req.body;

    // Check email domain restriction
    const allowedDomain = 'yeemscoffee.com';
    const emailDomain = email.split('@')[1];

    if (emailDomain !== allowedDomain) {
      return res.status(400).json({
        error: `Only ${allowedDomain} email addresses are allowed to register.`
      });
    }

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
      `INSERT INTO users (email, password_hash, first_name, last_name, employee_id, department)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, email, first_name, last_name, employee_id, department, role, created_at`,
      [email, passwordHash, firstName, lastName, employeeId, null]
    );

    const user = result.rows[0];

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.status(201).json({
      message: 'User registered successfully',
      token,
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
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// Login
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    // Find user
    const result = await db.query(
      `SELECT id, email, password_hash, first_name, last_name, employee_id, 
              department, role, is_active
       FROM users WHERE email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(401).json({ error: 'Account is inactive. Please contact administrator.' });
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      message: 'Login successful',
      token,
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
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// Get current user (with manager info for org chart)
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.employee_id,
              u.department, u.role, u.manager_id, u.created_at,
              m.first_name || ' ' || m.last_name as manager_name
       FROM users u
       LEFT JOIN users m ON u.manager_id = m.id
       WHERE u.id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    res.json({
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      employeeId: user.employee_id,
      department: user.department,
      role: user.role,
      manager_id: user.manager_id,
      manager_name: user.manager_name,
      createdAt: user.created_at
    });
  } catch (error) {
    console.error('User fetch error:', error);
    res.status(500).json({ error: 'Server error fetching user' });
  }
});

// Get current user profile
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, email, first_name, last_name, employee_id, department, role, created_at
       FROM users WHERE id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    res.json({
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      employeeId: user.employee_id,
      department: user.department,
      role: user.role,
      createdAt: user.created_at
    });
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ error: 'Server error fetching profile' });
  }
});

// Update user profile
router.put('/profile', authMiddleware, [
  body('firstName').optional().trim(),
  body('lastName').optional().trim(),
  body('department').optional().trim()
], async (req, res) => {
  try {
    const { firstName, lastName, department } = req.body;
    
    const result = await db.query(
      `UPDATE users 
       SET first_name = COALESCE($1, first_name),
           last_name = COALESCE($2, last_name),
           department = COALESCE($3, department),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING id, email, first_name, last_name, employee_id, department, role`,
      [firstName, lastName, department, req.user.id]
    );

    const user = result.rows[0];
    res.json({
      message: 'Profile updated successfully',
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
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Server error updating profile' });
  }
});

// Change password
router.post('/change-password', authMiddleware, [
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 6 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { currentPassword, newPassword } = req.body;

    // Get current password hash
    const result = await db.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [req.user.id]
    );

    const user = result.rows[0];

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const newPasswordHash = await bcrypt.hash(newPassword, salt);

    // Update password
    await db.query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newPasswordHash, req.user.id]
    );

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ error: 'Server error changing password' });
  }
});

// Forgot password - Request password reset
router.post('/forgot-password',
  passwordResetLimiter, // Apply rate limiting
  [
    body('email').isEmail().normalizeEmail()
  ],
  async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email } = req.body;

    // Find user by email
    const result = await db.query(
      `SELECT id, email, first_name, last_name, is_active
       FROM users WHERE email = $1`,
      [email]
    );

    // Always return success message to prevent email enumeration
    // Don't reveal if email exists or not
    if (result.rows.length === 0) {
      return res.json({
        message: 'If an account exists with this email, a password reset link will be sent.'
      });
    }

    const user = result.rows[0];

    // Don't send reset email for inactive accounts
    if (!user.is_active) {
      return res.json({
        message: 'If an account exists with this email, a password reset link will be sent.'
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = await bcrypt.hash(resetToken, 10);

    // Token expires in 1 hour
    const expiresAt = new Date(Date.now() + 3600000); // 1 hour from now

    // Store hashed token in database
    await db.query(
      `UPDATE users
       SET reset_token = $1,
           reset_token_expires_at = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [resetTokenHash, expiresAt, user.id]
    );

    // Send reset email
    const emailResult = await sendPasswordResetEmail({
      email: user.email,
      name: `${user.first_name} ${user.last_name}`
    }, resetToken);

    if (!emailResult.success) {
      console.error('Failed to send password reset email:', emailResult.error);
      // Don't expose email failure to user
    }

    res.json({
      message: 'If an account exists with this email, a password reset link will be sent.'
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Server error processing password reset request' });
  }
});

// Reset password with token
router.post('/reset-password', [
  body('token').notEmpty(),
  body('newPassword').isLength({ min: 6 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { token, newPassword } = req.body;

    // Find user with non-expired token
    const result = await db.query(
      `SELECT id, email, first_name, last_name, reset_token, reset_token_expires_at
       FROM users
       WHERE reset_token IS NOT NULL
       AND reset_token_expires_at > CURRENT_TIMESTAMP`,
      []
    );

    if (result.rows.length === 0) {
      return res.status(400).json({
        error: 'Invalid or expired reset token. Please request a new password reset.'
      });
    }

    // Check each user's token to find match
    let matchedUser = null;
    for (const user of result.rows) {
      const isValidToken = await bcrypt.compare(token, user.reset_token);
      if (isValidToken) {
        matchedUser = user;
        break;
      }
    }

    if (!matchedUser) {
      return res.status(400).json({
        error: 'Invalid or expired reset token. Please request a new password reset.'
      });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const newPasswordHash = await bcrypt.hash(newPassword, salt);

    // Update password and clear reset token
    await db.query(
      `UPDATE users
       SET password_hash = $1,
           reset_token = NULL,
           reset_token_expires_at = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [newPasswordHash, matchedUser.id]
    );

    res.json({
      message: 'Password reset successfully. You can now log in with your new password.'
    });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Server error resetting password' });
  }
});

// Validate reset token (optional endpoint for frontend to check token validity)
router.get('/validate-reset-token/:token', async (req, res) => {
  try {
    const { token } = req.params;

    // Find users with non-expired tokens
    const result = await db.query(
      `SELECT id, reset_token, reset_token_expires_at
       FROM users
       WHERE reset_token IS NOT NULL
       AND reset_token_expires_at > CURRENT_TIMESTAMP`,
      []
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ valid: false, error: 'Invalid or expired token' });
    }

    // Check each user's token to find match
    let isValidToken = false;
    for (const user of result.rows) {
      const tokenMatches = await bcrypt.compare(token, user.reset_token);
      if (tokenMatches) {
        isValidToken = true;
        break;
      }
    }

    if (!isValidToken) {
      return res.status(400).json({ valid: false, error: 'Invalid or expired token' });
    }

    res.json({ valid: true });

  } catch (error) {
    console.error('Validate token error:', error);
    res.status(500).json({ valid: false, error: 'Server error validating token' });
  }
});

module.exports = router;
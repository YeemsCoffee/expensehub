const jwt = require('jsonwebtoken');
const db = require('../config/database');

const authMiddleware = async (req, res, next) => {
  try {
    // Get token from header
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'No authentication token, access denied' });
    }

    // Verify token, then refresh mutable user attributes from the database.
    // Roles can change after a token is issued; using the token role alone can
    // incorrectly route admins/developers through approval workflows until logout.
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userResult = await db.query(
      `SELECT id, email, first_name, last_name, role, is_active
       FROM users
       WHERE id = $1`,
      [decoded.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'User no longer exists' });
    }

    const user = userResult.rows[0];
    if (!user.is_active) {
      return res.status(401).json({ error: 'Account is inactive. Please contact administrator.' });
    }

    req.user = {
      ...decoded,
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.first_name,
      lastName: user.last_name,
      name: `${user.first_name} ${user.last_name}`
    };
    next();
  } catch (error) {
    console.error('Authentication error:', error.message);
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token has expired' });
    }
    res.status(401).json({ error: 'Token is not valid' });
  }
};

// Middleware to check if user is admin
const isAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Admin rights required.' });
  }
  next();
};

// Middleware to check if user is manager or admin
const isManagerOrAdmin = (req, res, next) => {
  if (req.user.role !== 'manager' && req.user.role !== 'admin' && req.user.role !== 'developer') {
    return res.status(403).json({ error: 'Access denied. Manager or admin rights required.' });
  }
  next();
};

// Middleware to check if user is admin or developer
const isAdminOrDeveloper = (req, res, next) => {
  if (req.user.role !== 'admin' && req.user.role !== 'developer') {
    return res.status(403).json({ error: 'Access denied. Admin or developer rights required.' });
  }
  next();
};

module.exports = { authMiddleware, isAdmin, isManagerOrAdmin, isAdminOrDeveloper };

const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  try {
    // Get token from header
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'No authentication token, access denied' });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
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
  if (req.user.role !== 'manager' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Manager or admin rights required.' });
  }
  next();
};

module.exports = { authMiddleware, isAdmin, isManagerOrAdmin };

const express = require('express');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Security Headers Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"], // Removed unsafe-inline and unsafe-eval for better security
      styleSrc: ["'self'", "'unsafe-inline'"], // Keep unsafe-inline for styles (less risky)
      imgSrc: ["'self'", "data:", "https:"], // Allow images from https and data URIs
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"], // Prevent plugins like Flash
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"], // Prevent iframe embedding
      baseUri: ["'self'"],
      formAction: ["'self'", "https://abintegrations.amazon.com"] // Allow Amazon Punchout
    }
  },
  strictTransportSecurity: {
    maxAge: 31536000, // 1 year in seconds
    includeSubDomains: true,
    preload: true
  },
  xContentTypeOptions: true, // Sets "X-Content-Type-Options: nosniff"
  xFrameOptions: { action: 'deny' } // Sets "X-Frame-Options: DENY"
}));

// Middleware
// CORS configuration - restrict to specific origins
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      process.env.FRONTEND_URL || 'http://localhost:3000',
      'http://localhost:3000',
      'https://expensehub-l8ka.onrender.com'  // Add your production frontend URL
    ];

    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' })); // Add size limit
app.use(express.urlencoded({ extended: true, limit: '10mb' })); // Add size limit

// Rate limiting configuration
// Strict rate limiting for authentication endpoints (prevent brute force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: {
    error: 'Too many authentication attempts. Please try again in 15 minutes.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false // Count all attempts
});

// General API rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: {
    error: 'Too many requests. Please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Apply rate limiting
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/', apiLimiter);

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users')); // User management
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/vendors', require('./routes/vendors'));
app.use('/api/cart', require('./routes/cart'));
app.use('/api/cost-centers', require('./routes/costCenters'));
app.use('/api/locations', require('./routes/locations')); // New locations routes
app.use('/api/projects', require('./routes/projects')); // New projects routes
app.use('/api/approval-rules', require('./routes/approvalRules')); // Org-chart-based approval rules
app.use('/api/expense-approvals', require('./routes/expenseApprovals')); // Expense approvals
app.use('/api/amazon-punchout', require('./routes/amazonPunchout')); // Amazon Business Punchout

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'ExpenseHub API is running',
    timestamp: new Date().toISOString()
  });
});

// Serve static files from React build (only in production)
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend/build')));

  // Handle React routing - return index.html for all non-API routes
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/build', 'index.html'));
  });
} else {
  // Root endpoint (development only)
  app.get('/', (req, res) => {
    res.json({
      message: 'ExpenseHub API - Enhanced Version',
      version: '2.0.0',
      endpoints: {
        auth: '/api/auth',
        expenses: '/api/expenses',
        vendors: '/api/vendors',
        cart: '/api/cart',
        costCenters: '/api/cost-centers',
        locations: '/api/locations',
        projects: '/api/projects',
        approvalRules: '/api/approval-rules',
        expenseApprovals: '/api/expense-approvals'
      }
    });
  });

  // 404 handler (development only)
  app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
  });
}

// Error handler
app.use((err, req, res, next) => {
  // Log full error server-side
  console.error('Error details:', {
    message: err.message,
    stack: err.stack,
    timestamp: new Date().toISOString(),
    path: req.path,
    method: req.method
  });

  // Return safe error message to client
  const isProduction = process.env.NODE_ENV === 'production';
  const statusCode = err.status || 500;

  res.status(statusCode).json({
    error: isProduction
      ? 'An error occurred. Please try again later.'
      : err.message,
    errorCode: err.code || 'INTERNAL_ERROR',
    ...(isProduction ? {} : { stack: err.stack }) // Only include stack in dev
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 ExpenseHub API Server - Enhanced`);
  console.log(`📍 Running on: http://localhost:${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`⏰ Started at: ${new Date().toLocaleString()}`);
  console.log(`\n✨ New Features:`);
  console.log(`   • Locations Management`);
  console.log(`   • Projects/Initiatives Tracking`);
  console.log(`   • Enhanced Expense Dimensions`);
  console.log(`   • Cost Type Auto-Calculation (OPEX/CAPEX)`);
  console.log(`   • Advanced Filtering & Analytics`);
  console.log(`   • Enhanced Dashboard\n`);
});

module.exports = app;
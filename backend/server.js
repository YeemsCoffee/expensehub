const express = require('express');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Trust proxy - required for Render and other reverse proxies
// This allows rate limiting and client IP detection to work correctly
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1); // Trust first proxy (Render)
}

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
const allowedOrigins = new Set([
  process.env.FRONTEND_URL || 'http://localhost:3000',
  'http://localhost:3000',
  'https://expensehub-l8ka.onrender.com'  // Production frontend URL
]);
const isDevelopment = process.env.NODE_ENV !== 'production';
const devOriginPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

const corsOptions = {
  origin: function (origin, callback) {
    // No Origin header: same-origin, curl, server-to-server. Nothing to grant.
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.has(origin) || (isDevelopment && devOriginPattern.test(origin))) {
      return callback(null, true);
    }

    // Not an allowed origin: omit the CORS headers rather than throwing.
    // Browsers then block cross-origin XHR themselves, while top-level form
    // POSTs (e.g. the Amazon Punchout return, which arrives with
    // Origin: null) are not subject to CORS and still reach the route.
    callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['X-Total-Count']
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

// Request logging (development only; production logs are handled by the host)
if (isDevelopment) {
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
  });
}

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
app.use('/api/receipts', require('./routes/receipts')); // Receipt OCR with Veryfi
app.use('/api/xero', require('./routes/xero')); // Xero accounting integration
app.use('/api/expense-categories', require('./routes/expenseCategories')); // Expense category management

// Phase 2: SAP-like Project Management Features
app.use('/api/project-phases', require('./routes/projectPhases')); // Project phases & milestones
app.use('/api/change-requests', require('./routes/changeRequests')); // Change request management
app.use('/api/project-templates', require('./routes/projectTemplates')); // Project templates
app.use('/api/project-documents', require('./routes/projectDocuments')); // Document management
app.use('/api/audit-trail', require('./routes/auditTrail')); // Audit trail / traceability

// Health check endpoint (public: liveness + DB reachability only, no schema details)
app.get('/api/health', async (req, res) => {
  try {
    const db = require('./config/database');
    await db.query('SELECT 1');
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('Health check failed:', error.message);
    res.status(503).json({ status: 'ERROR', timestamp: new Date().toISOString() });
  }
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

// Start server with migrations
const { runMigrations } = require('./config/migrations');

async function startServer() {
  try {
    // Run database migrations first
    await runMigrations();

    // Then start the server
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
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();

module.exports = app;
const express = require('express');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
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
      formAction: ["'self'"]
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
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
app.use('/api/approval-flows', require('./routes/approvalFlows')); // Approval flows management
app.use('/api/approval-rules', require('./routes/approvalRules')); // Org-chart-based approval rules
app.use('/api/expense-approvals', require('./routes/expenseApprovals')); // Expense approvals

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
        approvalFlows: '/api/approval-flows',
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
  console.error('Error:', err);
  res.status(err.status || 500).json({ 
    error: err.message || 'Internal server error' 
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
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

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
app.use('/api/punchout', require('./routes/punchout'));
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

// Root endpoint
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
      punchout: '/api/punchout',
      approvalFlows: '/api/approval-flows',
      expenseApprovals: '/api/expense-approvals'
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

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
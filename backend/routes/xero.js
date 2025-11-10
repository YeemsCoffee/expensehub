const express = require('express');
const router = express.Router();
const { authMiddleware, isAdmin } = require('../middleware/auth');
const xeroService = require('../services/xeroService');
const db = require('../config/database');

// GET /api/xero/connect - Initiate Xero OAuth flow
router.get('/connect', authMiddleware, async (req, res) => {
  try {
    // Store user ID in state parameter for callback
    const stateParam = Buffer.from(JSON.stringify({ userId: req.user.id })).toString('base64');

    // Get auth URL with state
    const authUrl = await xeroService.getAuthorizationUrl(stateParam);

    res.json({
      authUrl: authUrl
    });

  } catch (error) {
    console.error('Xero connect error:', error);
    res.status(500).json({ error: 'Failed to initiate Xero connection' });
  }
});

// GET /api/xero/callback - Handle OAuth callback from Xero
router.get('/callback', async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code) {
      return res.status(400).send('Authorization code missing');
    }

    // Decode state to get user ID
    const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    const userId = stateData.userId;

    // Build full callback URL for xero-node (it needs the full URL, not just the code)
    const callbackUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

    // Exchange code for tokens
    const result = await xeroService.handleCallback(callbackUrl);

    if (!result.success) {
      return res.status(500).send(`Failed to connect to Xero: ${result.error}`);
    }

    // Store tokens in database
    for (const tenant of result.tenants) {
      await db.query(
        `INSERT INTO xero_connections (
          user_id, tenant_id, tenant_name, access_token, refresh_token,
          id_token, expires_at, token_type, scope
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (user_id, tenant_id)
        DO UPDATE SET
          access_token = EXCLUDED.access_token,
          refresh_token = EXCLUDED.refresh_token,
          id_token = EXCLUDED.id_token,
          expires_at = EXCLUDED.expires_at,
          is_active = true,
          updated_at = CURRENT_TIMESTAMP`,
        [
          userId,
          tenant.tenantId,
          tenant.tenantName,
          result.tokenSet.access_token,
          result.tokenSet.refresh_token,
          result.tokenSet.id_token,
          new Date(Date.now() + (result.tokenSet.expires_in * 1000)),
          result.tokenSet.token_type || 'Bearer',
          result.tokenSet.scope
        ]
      );
    }

    // Redirect back to frontend with success
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/#/xero-connected?success=true`);

  } catch (error) {
    console.error('Xero callback error:', error);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/#/xero-connected?success=false&error=${encodeURIComponent(error.message)}`);
  }
});

// GET /api/xero/status - Check Xero connection status
router.get('/status', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT tenant_id, tenant_name, is_active, created_at, updated_at
       FROM xero_connections
       WHERE user_id = $1 AND is_active = true
       ORDER BY updated_at DESC`,
      [req.user.id]
    );

    res.json({
      connected: result.rows.length > 0,
      connections: result.rows
    });

  } catch (error) {
    console.error('Xero status error:', error);
    res.status(500).json({ error: 'Failed to check Xero status' });
  }
});

// POST /api/xero/disconnect - Disconnect Xero
router.post('/disconnect', authMiddleware, async (req, res) => {
  try {
    const { tenantId } = req.body;

    await db.query(
      `UPDATE xero_connections
       SET is_active = false, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND tenant_id = $2`,
      [req.user.id, tenantId]
    );

    res.json({ message: 'Disconnected from Xero successfully' });

  } catch (error) {
    console.error('Xero disconnect error:', error);
    res.status(500).json({ error: 'Failed to disconnect from Xero' });
  }
});

// GET /api/xero/accounts - Get Xero chart of accounts
router.get('/accounts', authMiddleware, async (req, res) => {
  try {
    const { tenantId } = req.query;

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID required' });
    }

    // Get active connection
    const connection = await getActiveConnection(req.user.id, tenantId);
    if (!connection) {
      return res.status(401).json({ error: 'Not connected to Xero' });
    }

    // Set access token
    xeroService.setAccessToken(connection.access_token);

    // Get chart of accounts
    const result = await xeroService.getChartOfAccounts(tenantId);

    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    res.json(result.accounts);

  } catch (error) {
    console.error('Get Xero accounts error:', error);
    res.status(500).json({ error: 'Failed to fetch Xero accounts' });
  }
});

// GET /api/xero/mappings - Get account mappings
router.get('/mappings', authMiddleware, async (req, res) => {
  try {
    const { tenantId } = req.query;

    const result = await db.query(
      `SELECT category, xero_account_code, xero_account_name
       FROM xero_account_mappings
       WHERE user_id = $1 AND tenant_id = $2
       ORDER BY category`,
      [req.user.id, tenantId]
    );

    res.json(result.rows);

  } catch (error) {
    console.error('Get mappings error:', error);
    res.status(500).json({ error: 'Failed to fetch account mappings' });
  }
});

// POST /api/xero/mappings - Save account mapping
router.post('/mappings', authMiddleware, async (req, res) => {
  try {
    const { tenantId, category, accountCode, accountName } = req.body;

    if (!tenantId || !category || !accountCode) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    await db.query(
      `INSERT INTO xero_account_mappings (
        user_id, tenant_id, category, xero_account_code, xero_account_name
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id, tenant_id, category)
      DO UPDATE SET
        xero_account_code = EXCLUDED.xero_account_code,
        xero_account_name = EXCLUDED.xero_account_name,
        updated_at = CURRENT_TIMESTAMP`,
      [req.user.id, tenantId, category, accountCode, accountName]
    );

    res.json({ message: 'Account mapping saved successfully' });

  } catch (error) {
    console.error('Save mapping error:', error);
    res.status(500).json({ error: 'Failed to save account mapping' });
  }
});

// POST /api/xero/sync/:expenseId - Sync single expense to Xero
router.post('/sync/:expenseId', authMiddleware, async (req, res) => {
  try {
    const { tenantId } = req.body;

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID required' });
    }

    // Get expense
    const expenseResult = await db.query(
      `SELECT e.*, u.first_name, u.last_name
       FROM expenses e
       JOIN users u ON e.user_id = u.id
       WHERE e.id = $1 AND e.user_id = $2 AND e.status = 'approved'`,
      [req.params.expenseId, req.user.id]
    );

    if (expenseResult.rows.length === 0) {
      return res.status(404).json({ error: 'Expense not found or not approved' });
    }

    const expense = expenseResult.rows[0];

    // Check if already synced
    if (expense.xero_invoice_id) {
      return res.status(400).json({ error: 'Expense already synced to Xero' });
    }

    // Get active connection
    const connection = await getActiveConnection(req.user.id, tenantId);
    if (!connection) {
      return res.status(401).json({ error: 'Not connected to Xero' });
    }

    // Set access token
    xeroService.setAccessToken(connection.access_token);

    // Get account mappings
    const mappingsResult = await db.query(
      `SELECT category, xero_account_code
       FROM xero_account_mappings
       WHERE user_id = $1 AND tenant_id = $2`,
      [req.user.id, tenantId]
    );

    const mapping = {
      categoryMapping: {},
      defaultExpenseAccount: '400',
      defaultTaxType: 'NONE'
    };

    mappingsResult.rows.forEach(row => {
      mapping.categoryMapping[row.category] = row.xero_account_code;
    });

    // Sync to Xero
    const result = await xeroService.syncExpenseToXero(tenantId, expense, mapping);

    if (!result.success) {
      return res.status(500).json({ error: result.error, details: result.details });
    }

    res.json({
      message: 'Expense synced to Xero successfully',
      xeroInvoiceId: result.xeroInvoiceId,
      xeroInvoiceNumber: result.xeroInvoiceNumber
    });

  } catch (error) {
    console.error('Sync expense error:', error);
    res.status(500).json({ error: 'Failed to sync expense to Xero' });
  }
});

// POST /api/xero/sync-bulk - Sync multiple expenses to Xero
router.post('/sync-bulk', authMiddleware, async (req, res) => {
  try {
    const { tenantId, expenseIds } = req.body;

    if (!tenantId || !expenseIds || !Array.isArray(expenseIds)) {
      return res.status(400).json({ error: 'Tenant ID and expense IDs required' });
    }

    // Get expenses
    const expensesResult = await db.query(
      `SELECT e.*, u.first_name, u.last_name
       FROM expenses e
       JOIN users u ON e.user_id = u.id
       WHERE e.id = ANY($1) AND e.user_id = $2 AND e.status = 'approved'
       AND e.xero_invoice_id IS NULL`,
      [expenseIds, req.user.id]
    );

    if (expensesResult.rows.length === 0) {
      return res.status(404).json({ error: 'No eligible expenses found' });
    }

    // Get active connection
    const connection = await getActiveConnection(req.user.id, tenantId);
    if (!connection) {
      return res.status(401).json({ error: 'Not connected to Xero' });
    }

    // Set access token
    xeroService.setAccessToken(connection.access_token);

    // Get account mappings
    const mappingsResult = await db.query(
      `SELECT category, xero_account_code
       FROM xero_account_mappings
       WHERE user_id = $1 AND tenant_id = $2`,
      [req.user.id, tenantId]
    );

    const mapping = {
      categoryMapping: {},
      defaultExpenseAccount: '400',
      defaultTaxType: 'NONE'
    };

    mappingsResult.rows.forEach(row => {
      mapping.categoryMapping[row.category] = row.xero_account_code;
    });

    // Bulk sync
    const result = await xeroService.bulkSyncExpenses(tenantId, expensesResult.rows, mapping);

    res.json({
      message: `Synced ${result.synced} expenses successfully`,
      synced: result.synced,
      failed: result.failed,
      details: result.details
    });

  } catch (error) {
    console.error('Bulk sync error:', error);
    res.status(500).json({ error: 'Failed to sync expenses to Xero' });
  }
});

// GET /api/xero/organization - Get Xero organization info
router.get('/organization', authMiddleware, async (req, res) => {
  try {
    const { tenantId } = req.query;

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID required' });
    }

    // Get active connection
    const connection = await getActiveConnection(req.user.id, tenantId);
    if (!connection) {
      return res.status(401).json({ error: 'Not connected to Xero' });
    }

    // Set access token
    xeroService.setAccessToken(connection.access_token);

    // Get organization info
    const result = await xeroService.getOrganization(tenantId);

    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    res.json(result.organization);

  } catch (error) {
    console.error('Get organization error:', error);
    res.status(500).json({ error: 'Failed to fetch organization info' });
  }
});

// Helper function to get active connection and refresh if needed
async function getActiveConnection(userId, tenantId) {
  const result = await db.query(
    `SELECT * FROM xero_connections
     WHERE user_id = $1 AND tenant_id = $2 AND is_active = true`,
    [userId, tenantId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const connection = result.rows[0];

  // Check if token is expired or expiring soon (within 5 minutes)
  const expiresAt = new Date(connection.expires_at);
  const now = new Date();
  const fiveMinutesFromNow = new Date(now.getTime() + (5 * 60 * 1000));

  if (expiresAt <= fiveMinutesFromNow) {
    // Refresh token
    xeroService.xero.setTokenSet({
      refresh_token: connection.refresh_token
    });

    const refreshResult = await xeroService.refreshAccessToken(connection.refresh_token);

    if (refreshResult.success) {
      // Update database with new tokens
      await db.query(
        `UPDATE xero_connections
         SET access_token = $1,
             refresh_token = $2,
             expires_at = $3,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $4`,
        [
          refreshResult.tokenSet.access_token,
          refreshResult.tokenSet.refresh_token,
          new Date(Date.now() + (refreshResult.tokenSet.expires_in * 1000)),
          connection.id
        ]
      );

      connection.access_token = refreshResult.tokenSet.access_token;
    }
  }

  return connection;
}

module.exports = router;

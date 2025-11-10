const express = require('express');
const router = express.Router();
const { authMiddleware, isAdmin, isAdminOrDeveloper } = require('../middleware/auth');
const xeroService = require('../services/xeroService');
const db = require('../config/database');

// GET /api/xero/connect - Initiate Xero OAuth flow (Admin/Developer only - organization-wide)
router.get('/connect', authMiddleware, isAdminOrDeveloper, async (req, res) => {
  try {
    // Store admin/developer user ID in state parameter for callback
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

    // Decode state to get admin/developer user ID
    const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    const connectedByUserId = stateData.userId;

    // Build full callback URL for xero-node (it needs the full URL, not just the code)
    const callbackUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

    // Exchange code for tokens (pass state so XeroClient can validate it)
    const result = await xeroService.handleCallback(callbackUrl, state);

    if (!result.success) {
      return res.status(500).send(`Failed to connect to Xero: ${result.error}`);
    }

    // Store tokens in database (organization-wide)
    for (const tenant of result.tenants) {
      // First, check if connection exists
      const existingConnection = await db.query(
        `SELECT id FROM xero_connections
         WHERE tenant_id = $1 AND (
           (is_organization_wide = true) OR
           (user_id IS NULL)
         )`,
        [tenant.tenantId]
      );

      if (existingConnection.rows.length > 0) {
        // Update existing connection
        await db.query(
          `UPDATE xero_connections
           SET access_token = $1,
               refresh_token = $2,
               id_token = $3,
               expires_at = $4,
               token_type = $5,
               scope = $6,
               is_active = true,
               is_organization_wide = true,
               connected_by_user_id = $7,
               tenant_name = $8,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $9`,
          [
            result.tokenSet.access_token,
            result.tokenSet.refresh_token,
            result.tokenSet.id_token,
            new Date(Date.now() + (result.tokenSet.expires_in * 1000)),
            result.tokenSet.token_type || 'Bearer',
            result.tokenSet.scope,
            connectedByUserId,
            tenant.tenantName,
            existingConnection.rows[0].id
          ]
        );
      } else {
        // Insert new connection
        await db.query(
          `INSERT INTO xero_connections (
            user_id, tenant_id, tenant_name, access_token, refresh_token,
            id_token, expires_at, token_type, scope, is_organization_wide, connected_by_user_id
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            null, // user_id is NULL for organization-wide
            tenant.tenantId,
            tenant.tenantName,
            result.tokenSet.access_token,
            result.tokenSet.refresh_token,
            result.tokenSet.id_token,
            new Date(Date.now() + (result.tokenSet.expires_in * 1000)),
            result.tokenSet.token_type || 'Bearer',
            result.tokenSet.scope,
            true, // is_organization_wide = true
            connectedByUserId // connected_by_user_id
          ]
        );
      }
    }

    // Redirect back to frontend Xero Settings page
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/#/xero-settings?connected=true`);

  } catch (error) {
    console.error('Xero callback error:', error);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/#/xero-settings?connected=false&error=${encodeURIComponent(error.message)}`);
  }
});

// GET /api/xero/status - Check Xero connection status (organization-wide)
router.get('/status', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT tenant_id, tenant_name, is_active, is_organization_wide,
              connected_by_user_id, created_at, updated_at
       FROM xero_connections
       WHERE is_organization_wide = true AND is_active = true
       ORDER BY updated_at DESC`,
      []
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

// POST /api/xero/disconnect - Disconnect Xero (Admin/Developer only)
router.post('/disconnect', authMiddleware, isAdminOrDeveloper, async (req, res) => {
  try {
    const { tenantId } = req.body;

    await db.query(
      `UPDATE xero_connections
       SET is_active = false, updated_at = CURRENT_TIMESTAMP
       WHERE tenant_id = $1 AND is_organization_wide = true`,
      [tenantId]
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

    // Get active organization-wide connection
    const connection = await getActiveConnection(tenantId);
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

// GET /api/xero/mappings - Get account mappings (organization-wide)
router.get('/mappings', authMiddleware, async (req, res) => {
  try {
    const { tenantId } = req.query;

    const result = await db.query(
      `SELECT category, xero_account_code, xero_account_name
       FROM xero_account_mappings
       WHERE is_organization_wide = true AND tenant_id = $1
       ORDER BY category`,
      [tenantId]
    );

    res.json(result.rows);

  } catch (error) {
    console.error('Get mappings error:', error);
    res.status(500).json({ error: 'Failed to fetch account mappings' });
  }
});

// POST /api/xero/mappings - Save account mapping (Admin/Developer only)
router.post('/mappings', authMiddleware, isAdminOrDeveloper, async (req, res) => {
  try {
    const { tenantId, category, accountCode, accountName } = req.body;

    if (!tenantId || !category || !accountCode) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if mapping exists
    const existingMapping = await db.query(
      `SELECT id FROM xero_account_mappings
       WHERE tenant_id = $1 AND category = $2 AND (
         (is_organization_wide = true) OR
         (user_id IS NULL)
       )`,
      [tenantId, category]
    );

    if (existingMapping.rows.length > 0) {
      // Update existing mapping
      await db.query(
        `UPDATE xero_account_mappings
         SET xero_account_code = $1,
             xero_account_name = $2,
             is_organization_wide = true,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [accountCode, accountName, existingMapping.rows[0].id]
      );
    } else {
      // Insert new mapping
      await db.query(
        `INSERT INTO xero_account_mappings (
          user_id, tenant_id, category, xero_account_code, xero_account_name, is_organization_wide
        )
        VALUES ($1, $2, $3, $4, $5, $6)`,
        [null, tenantId, category, accountCode, accountName, true]
      );
    }

    res.json({ message: 'Account mapping saved successfully' });

  } catch (error) {
    console.error('Save mapping error:', error);
    res.status(500).json({ error: 'Failed to save account mapping' });
  }
});

// POST /api/xero/sync/:expenseId - Sync single expense to Xero (any user can sync)
router.post('/sync/:expenseId', authMiddleware, async (req, res) => {
  try {
    const { tenantId } = req.body;

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID required' });
    }

    // Get expense - allow any user to sync their own approved expenses
    const expenseResult = await db.query(
      `SELECT e.*, u.first_name, u.last_name
       FROM expenses e
       JOIN users u ON e.user_id = u.id
       WHERE e.id = $1 AND e.status = 'approved'`,
      [req.params.expenseId]
    );

    if (expenseResult.rows.length === 0) {
      return res.status(404).json({ error: 'Expense not found or not approved' });
    }

    const expense = expenseResult.rows[0];

    // Check if already synced
    if (expense.xero_invoice_id) {
      return res.status(400).json({ error: 'Expense already synced to Xero' });
    }

    // Get active organization-wide connection
    const connection = await getActiveConnection(tenantId);
    if (!connection) {
      return res.status(401).json({ error: 'Not connected to Xero' });
    }

    // Set access token
    xeroService.setAccessToken(connection.access_token);

    // Get account mappings (organization-wide)
    const mappingsResult = await db.query(
      `SELECT category, xero_account_code
       FROM xero_account_mappings
       WHERE is_organization_wide = true AND tenant_id = $1`,
      [tenantId]
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

// POST /api/xero/sync-bulk - Sync multiple expenses to Xero (any user)
router.post('/sync-bulk', authMiddleware, async (req, res) => {
  try {
    const { tenantId, expenseIds } = req.body;

    if (!tenantId || !expenseIds || !Array.isArray(expenseIds)) {
      return res.status(400).json({ error: 'Tenant ID and expense IDs required' });
    }

    // Get expenses - approved expenses from any user
    const expensesResult = await db.query(
      `SELECT e.*, u.first_name, u.last_name
       FROM expenses e
       JOIN users u ON e.user_id = u.id
       WHERE e.id = ANY($1) AND e.status = 'approved'
       AND e.xero_invoice_id IS NULL`,
      [expenseIds]
    );

    if (expensesResult.rows.length === 0) {
      return res.status(404).json({ error: 'No eligible expenses found' });
    }

    // Get active organization-wide connection
    const connection = await getActiveConnection(tenantId);
    if (!connection) {
      return res.status(401).json({ error: 'Not connected to Xero' });
    }

    // Set access token
    xeroService.setAccessToken(connection.access_token);

    // Get account mappings
    const mappingsResult = await db.query(
      `SELECT category, xero_account_code
       FROM xero_account_mappings
       WHERE is_organization_wide = true AND tenant_id = $1`,
      [tenantId]
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

    // Get active organization-wide connection
    const connection = await getActiveConnection(tenantId);
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

// Helper function to get active organization-wide connection and refresh if needed
async function getActiveConnection(tenantId) {
  const result = await db.query(
    `SELECT * FROM xero_connections
     WHERE tenant_id = $1 AND is_organization_wide = true AND is_active = true`,
    [tenantId]
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

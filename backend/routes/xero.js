const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { authMiddleware, isAdminOrDeveloper } = require('../middleware/auth');
const { getValidXeroConnection, respondNotConnected } = require('../services/xeroConnection');
const {
  DEFAULT_KEY,
  annotateAccount,
  isSelectableAccount,
  problemText,
  accountProblem,
  getChart,
  normalizeCategoryKey,
  buildMappingOverview
} = require('../services/xeroAccounts');
const { syncExpensesToXero } = require('../services/xeroSync');
const xeroService = require('../services/xeroService');
const db = require('../config/database');

// Serialises the OAuth callback and default-organisation changes so two of
// them can never leave two default organisations.
const XERO_ORG_LOCK = 7340021;

/** Payload of a JWT without verifying it (the token came from Xero over TLS). */
function decodeJwtPayload(token) {
  try {
    const part = String(token || '').split('.')[1];
    if (!part) return null;
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
  } catch (err) {
    return null;
  }
}

/** Mark one organisation as the default, inside the caller's transaction. */
async function setDefaultOrganisation(client, tenantId) {
  const target = await client.query(
    `SELECT id FROM xero_connections
     WHERE tenant_id = $1 AND is_organization_wide = true AND is_active = true
     ORDER BY id DESC
     LIMIT 1`,
    [tenantId]
  );
  if (!target.rows[0]) return false;

  const id = target.rows[0].id;
  await client.query(
    `UPDATE xero_connections SET is_default = false
     WHERE is_organization_wide = true AND is_default = true AND id <> $1`,
    [id]
  );
  await client.query(
    'UPDATE xero_connections SET is_default = true WHERE id = $1',
    [id]
  );
  return true;
}

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
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
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

    // Only organisations can hold a chart of accounts (not practices etc.)
    const tenants = (result.tenants || []).filter(
      (t) => !t.tenantType || t.tenantType === 'ORGANISATION'
    );
    if (tenants.length === 0) {
      return res.redirect(`${frontendUrl}/#/xero-settings?connected=false&error=${encodeURIComponent('No Xero organisation was authorised')}`);
    }

    const ts = result.tokenSet;
    // All organisations authorised here share this one token set (one grant)
    const grantId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + ((ts.expires_in || 1800) * 1000));
    // The organisations the admin picked on Xero's consent screen this time.
    // GET /connections returns every organisation ever connected to the app.
    const authEventId = (decodeJwtPayload(ts.access_token) || {}).authentication_event_id || null;

    let needsChoice = false;
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1)', [XERO_ORG_LOCK]);

      for (const tenant of tenants) {
        const isDemo = Boolean(tenant.orgData && tenant.orgData.isDemoCompany);
        const existing = await client.query(
          `SELECT id FROM xero_connections
           WHERE tenant_id = $1 AND (is_organization_wide = true OR user_id IS NULL)
           ORDER BY id DESC
           LIMIT 1`,
          [tenant.tenantId]
        );

        if (existing.rows.length > 0) {
          await client.query(
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
                 grant_id = $9,
                 xero_connection_id = $10,
                 is_demo_company = $11,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $12`,
            [
              ts.access_token,
              ts.refresh_token,
              ts.id_token,
              expiresAt,
              ts.token_type || 'Bearer',
              ts.scope,
              connectedByUserId,
              tenant.tenantName,
              grantId,
              tenant.id || null,
              isDemo,
              existing.rows[0].id
            ]
          );
        } else {
          await client.query(
            `INSERT INTO xero_connections (
              user_id, tenant_id, tenant_name, access_token, refresh_token,
              id_token, expires_at, token_type, scope, is_organization_wide, connected_by_user_id,
              grant_id, xero_connection_id, is_demo_company
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
            [
              null, // user_id is NULL for organization-wide
              tenant.tenantId,
              tenant.tenantName,
              ts.access_token,
              ts.refresh_token,
              ts.id_token,
              expiresAt,
              ts.token_type || 'Bearer',
              ts.scope,
              true, // is_organization_wide = true
              connectedByUserId,
              grantId,
              tenant.id || null,
              isDemo
            ]
          );
        }
      }

      // Organisations no longer connected to the app in Xero
      const tenantIds = tenants.map((t) => t.tenantId);
      await client.query(
        `UPDATE xero_connections
         SET is_active = false, is_default = false, updated_at = CURRENT_TIMESTAMP
         WHERE is_organization_wide = true AND is_active = true
           AND NOT (tenant_id = ANY($1::text[]))`,
        [tenantIds]
      );

      // Choose the organisation to sync to:
      //  - the single organisation picked in this consent, else
      //  - the existing default if it is still connected, else
      //  - the only connected organisation, else
      //  - nobody: the Settings page asks the admin to choose.
      const pickedNow = authEventId ? tenants.filter((t) => t.authEventId === authEventId) : [];
      let defaultTenantId = null;
      if (pickedNow.length === 1) {
        defaultTenantId = pickedNow[0].tenantId;
      } else {
        const current = await client.query(
          `SELECT tenant_id FROM xero_connections
           WHERE is_organization_wide = true AND is_active = true AND is_default = true
           LIMIT 1`
        );
        if (current.rows[0]) {
          defaultTenantId = current.rows[0].tenant_id;
        } else if (new Set(tenantIds).size === 1) {
          defaultTenantId = tenantIds[0];
        }
      }

      if (defaultTenantId) {
        await setDefaultOrganisation(client, defaultTenantId);
      } else {
        needsChoice = true;
      }

      await client.query('COMMIT');
    } catch (txError) {
      await client.query('ROLLBACK').catch(() => {});
      throw txError;
    } finally {
      client.release();
    }

    // Redirect back to frontend Xero Settings page
    res.redirect(`${frontendUrl}/#/xero-settings?connected=true${needsChoice ? '&choose=1' : ''}`);

  } catch (error) {
    console.error('Xero callback error:', error);
    res.redirect(`${frontendUrl}/#/xero-settings?connected=false&error=${encodeURIComponent(error.message)}`);
  }
});

// GET /api/xero/status - Check Xero connection status (organization-wide)
router.get('/status', authMiddleware, isAdminOrDeveloper, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT tenant_id, tenant_name, is_default, is_demo_company,
              connected_by_user_id, created_at, updated_at
       FROM xero_connections
       WHERE is_organization_wide = true AND is_active = true
       ORDER BY is_default DESC, tenant_name ASC, id DESC`
    );

    // One entry per organisation
    const seen = new Set();
    const connections = result.rows.filter((row) => {
      if (seen.has(row.tenant_id)) return false;
      seen.add(row.tenant_id);
      return true;
    });

    const chosen = connections.find((c) => c.is_default);
    const defaultTenantId = chosen
      ? chosen.tenant_id
      : (connections.length === 1 ? connections[0].tenant_id : null);

    res.json({
      connected: connections.length > 0,
      connections,
      defaultTenantId,
      needsDefault: connections.length > 1 && !chosen
    });

  } catch (error) {
    console.error('Xero status error:', error);
    res.status(500).json({ error: 'Failed to check Xero status' });
  }
});

// POST /api/xero/default - Choose the organisation approved expenses sync to
router.post('/default', authMiddleware, isAdminOrDeveloper, async (req, res) => {
  const { tenantId } = req.body || {};
  if (!tenantId) {
    return res.status(400).json({ error: 'Tenant ID required' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [XERO_ORG_LOCK]);
    const ok = await setDefaultOrganisation(client, tenantId);
    if (!ok) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'That Xero organisation is not connected' });
    }
    await client.query('COMMIT');
    res.json({ message: 'Default Xero organisation updated', defaultTenantId: tenantId });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Set default Xero organisation error:', error);
    res.status(500).json({ error: 'Failed to change the Xero organisation' });
  } finally {
    client.release();
  }
});

// POST /api/xero/disconnect - Disconnect ExpenseHub from Xero (Admin/Developer only)
// Disconnects every organisation: they share one OAuth grant, so revoking it
// at Xero disconnects them all. Account mappings are kept for reconnecting.
router.post('/disconnect', authMiddleware, isAdminOrDeveloper, async (req, res) => {
  try {
    const rows = await db.query(
      `SELECT id, grant_id, access_token, refresh_token
       FROM xero_connections
       WHERE is_organization_wide = true AND is_active = true
       ORDER BY id`
    );

    // Best-effort revoke of each grant at Xero
    const revoked = new Set();
    for (const row of rows.rows) {
      const key = row.grant_id || row.refresh_token;
      if (revoked.has(key)) continue;
      revoked.add(key);
      await xeroService.revokeGrant(row.access_token, row.refresh_token);
    }

    await db.query(
      `UPDATE xero_connections
       SET is_active = false, is_default = false, updated_at = CURRENT_TIMESTAMP
       WHERE is_organization_wide = true AND is_active = true`
    );

    res.json({ message: 'Disconnected from Xero successfully' });

  } catch (error) {
    console.error('Xero disconnect error:', error);
    res.status(500).json({ error: 'Failed to disconnect from Xero' });
  }
});

// GET /api/xero/accounts - The organisation's full chart of accounts, each
// annotated with whether expenses can be posted to it and, if not, why.
router.get('/accounts', authMiddleware, isAdminOrDeveloper, async (req, res) => {
  try {
    const { tenantId } = req.query;

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID required' });
    }

    const conn = await getActiveConnection(tenantId);
    if (!conn.connection) {
      return respondNotConnected(res, conn);
    }

    xeroService.setAccessToken(conn.connection.access_token, conn.connection.refresh_token);

    // Always fresh: the admin may be comparing this with Xero right now
    const result = await getChart(tenantId, { force: true });

    if (!result.success) {
      return res.status(502).json({
        error: `Xero returned an error loading the chart of accounts: ${result.error}`,
        code: 'XERO_API_ERROR'
      });
    }

    res.json(result.accounts.map(annotateAccount));

  } catch (error) {
    console.error('Get Xero accounts error:', error);
    res.status(500).json({ error: 'Failed to fetch Xero accounts' });
  }
});

// GET /api/xero/mappings - For each expense category: what it is mapped to on
// this page, and the account its expenses will actually post to.
router.get('/mappings', authMiddleware, isAdminOrDeveloper, async (req, res) => {
  try {
    const { tenantId } = req.query;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID required' });
    }

    // Validate against the live chart when Xero is reachable; still show the
    // saved mappings when it is not.
    let chart = null;
    const conn = await getActiveConnection(tenantId);
    if (conn.connection) {
      xeroService.setAccessToken(conn.connection.access_token, conn.connection.refresh_token);
      const chartResult = await getChart(tenantId);
      if (chartResult.success) chart = chartResult.accounts;
    }

    res.json(await buildMappingOverview(tenantId, chart));

  } catch (error) {
    console.error('Get mappings error:', error);
    res.status(500).json({ error: 'Failed to fetch account mappings' });
  }
});

// POST /api/xero/mappings - Map a category (or '__default__') to an account
// that exists, is active and can be posted to in the organisation's chart.
router.post('/mappings', authMiddleware, isAdminOrDeveloper, async (req, res) => {
  try {
    const { tenantId, category, accountId, accountCode } = req.body || {};

    if (!tenantId || !category || (!accountId && !accountCode)) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const key = normalizeCategoryKey(category);
    if (!key || key === '_') {
      return res.status(400).json({ error: 'Invalid category' });
    }

    const conn = await getActiveConnection(tenantId);
    if (!conn.connection) {
      return respondNotConnected(res, conn);
    }
    xeroService.setAccessToken(conn.connection.access_token, conn.connection.refresh_token);

    const chart = await getChart(tenantId, { force: true });
    if (!chart.success) {
      return res.status(502).json({
        error: `Could not verify the account with Xero: ${chart.error}`,
        code: 'XERO_API_ERROR'
      });
    }

    const account = accountId
      ? chart.accounts.find((a) => a.accountId === accountId)
      : chart.accounts.find((a) => a.code === accountCode);

    if (!account) {
      return res.status(400).json({ error: 'That account does not exist in this Xero organisation' });
    }
    if (!isSelectableAccount(account)) {
      return res.status(400).json({
        error: `Account ${account.code || ''} ${account.name} ${problemText(accountProblem(account), account)}`.replace(/\s+/g, ' ').trim()
      });
    }

    // Upsert by normalised key; collapse duplicates saved under older key styles
    const existing = await db.query(
      `SELECT id, category FROM xero_account_mappings
       WHERE tenant_id = $1 AND (is_organization_wide = true OR user_id IS NULL)
       ORDER BY updated_at DESC NULLS LAST, id DESC`,
      [tenantId]
    );
    const same = existing.rows.filter((r) => normalizeCategoryKey(r.category) === key);

    if (same.length > 0) {
      await db.query(
        `UPDATE xero_account_mappings
         SET category = $1,
             xero_account_code = $2,
             xero_account_name = $3,
             xero_account_id = $4,
             is_organization_wide = true,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $5`,
        [key, account.code, account.name, account.accountId, same[0].id]
      );
      if (same.length > 1) {
        await db.query(
          'DELETE FROM xero_account_mappings WHERE id = ANY($1::int[])',
          [same.slice(1).map((r) => r.id)]
        );
      }
    } else {
      await db.query(
        `INSERT INTO xero_account_mappings (
          user_id, tenant_id, category, xero_account_code, xero_account_name, xero_account_id, is_organization_wide
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [null, tenantId, key, account.code, account.name, account.accountId, true]
      );
    }

    res.json({
      message: 'Account mapping saved successfully',
      mapping: { category: key, code: account.code, name: account.name, accountId: account.accountId }
    });

  } catch (error) {
    console.error('Save mapping error:', error);
    res.status(500).json({ error: 'Failed to save account mapping' });
  }
});

// DELETE /api/xero/mappings?tenantId=&category= - Remove a mapping
router.delete('/mappings', authMiddleware, isAdminOrDeveloper, async (req, res) => {
  try {
    const tenantId = req.query.tenantId || (req.body && req.body.tenantId);
    const category = req.query.category || (req.body && req.body.category);

    if (!tenantId || !category) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const key = normalizeCategoryKey(category);
    const rows = await db.query(
      `SELECT id, category FROM xero_account_mappings
       WHERE tenant_id = $1 AND (is_organization_wide = true OR user_id IS NULL)`,
      [tenantId]
    );
    const ids = rows.rows
      .filter((r) => normalizeCategoryKey(r.category) === key)
      .map((r) => r.id);

    if (ids.length > 0) {
      await db.query('DELETE FROM xero_account_mappings WHERE id = ANY($1::int[])', [ids]);
    }

    res.json({ message: 'Account mapping removed', removed: ids.length });

  } catch (error) {
    console.error('Delete mapping error:', error);
    res.status(500).json({ error: 'Failed to remove account mapping' });
  }
});

// POST /api/xero/sync/:expenseId - Sync one approved expense to Xero
router.post('/sync/:expenseId', authMiddleware, isAdminOrDeveloper, async (req, res) => {
  try {
    const { tenantId } = req.body || {};

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

    if (expense.xero_invoice_id) {
      return res.status(400).json({ error: 'Expense already synced to Xero' });
    }

    // The named organisation, or the default one
    const conn = await getActiveConnection(tenantId);
    if (!conn.connection) {
      return respondNotConnected(res, conn);
    }

    const result = await syncExpensesToXero(conn.connection, [expense]);

    if (result.synced === 1) {
      const posted = result.details.synced[0];
      return res.json({
        message: `Expense synced to Xero (account ${posted.accountCode}${posted.accountName ? ` - ${posted.accountName}` : ''})`,
        xeroInvoiceId: posted.xeroInvoiceId,
        xeroInvoiceNumber: posted.xeroInvoiceNumber,
        accountCode: posted.accountCode
      });
    }

    const failure = result.details.failed[0];
    res.status(422).json({ error: failure ? failure.error : 'Expense was not synced' });

  } catch (error) {
    console.error('Sync expense error:', error);
    res.status(500).json({ error: 'Failed to sync expense to Xero' });
  }
});

// POST /api/xero/sync-bulk - Sync several approved expenses to Xero
router.post('/sync-bulk', authMiddleware, isAdminOrDeveloper, async (req, res) => {
  try {
    const { tenantId, expenseIds } = req.body || {};

    if (!Array.isArray(expenseIds) || expenseIds.length === 0) {
      return res.status(400).json({ error: 'Expense IDs required' });
    }

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

    const conn = await getActiveConnection(tenantId);
    if (!conn.connection) {
      return respondNotConnected(res, conn);
    }

    const result = await syncExpensesToXero(conn.connection, expensesResult.rows);

    const already = result.skipped
      ? ` ${result.skipped} ${result.skipped === 1 ? 'was' : 'were'} already synced.`
      : '';
    const message = result.failed
      ? `Synced ${result.synced} of ${expensesResult.rows.length} expenses.${already} ${result.failed} could not be synced - see the Xero Status column for the reason.`
      : `Synced ${result.synced} expense${result.synced === 1 ? '' : 's'}.${already}`;

    res.json({
      message,
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
router.get('/organization', authMiddleware, isAdminOrDeveloper, async (req, res) => {
  try {
    const { tenantId } = req.query;

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID required' });
    }

    const conn = await getActiveConnection(tenantId);
    if (!conn.connection) {
      return respondNotConnected(res, conn);
    }
    const connection = conn.connection;

    xeroService.setAccessToken(connection.access_token, connection.refresh_token);

    const result = await xeroService.getOrganization(tenantId);

    if (!result.success) {
      return res.status(502).json({ error: result.error, code: 'XERO_API_ERROR' });
    }

    res.json(result.organization);

  } catch (error) {
    console.error('Get organization error:', error);
    res.status(500).json({ error: 'Failed to fetch organization info' });
  }
});

// GET /api/xero/expenses - Get approved expenses with Xero sync status
router.get('/expenses', authMiddleware, isAdminOrDeveloper, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT e.id, e.description, e.amount, e.category, e.date, e.vendor_name,
              e.status, e.xero_invoice_id, e.xero_synced_at, e.xero_sync_error,
              u.first_name || ' ' || u.last_name as submitted_by
       FROM expenses e
       JOIN users u ON e.user_id = u.id
       WHERE e.status = 'approved'
       ORDER BY e.date DESC
       LIMIT 100`
    );

    res.json(result.rows);

  } catch (error) {
    console.error('Get Xero expenses error:', error);
    res.status(500).json({ error: 'Failed to fetch expenses' });
  }
});

// The organisation named by tenantId, or the default organisation when it is
// omitted, with its token refreshed if needed. Delegates to
// services/xeroConnection (row-locked, per-grant refresh).
// Returns { connection } or { connection: null, reason, error? }.
function getActiveConnection(tenantId) {
  return getValidXeroConnection({ tenantId: tenantId || undefined });
}

module.exports = router;
// Exposed for tests
module.exports.decodeJwtPayload = decodeJwtPayload;
module.exports.DEFAULT_KEY = DEFAULT_KEY;

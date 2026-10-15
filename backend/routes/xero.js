const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { authMiddleware, isAdminOrDeveloper } = require('../middleware/auth');
const {
  getValidXeroConnection,
  getDefaultOrganisation,
  respondNotConnected
} = require('../services/xeroConnection');
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

// How long an admin has to finish signing in to Xero after clicking Connect
const OAUTH_STATE_TTL_MINUTES = 15;

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
    // A random, single-use state stored server-side for this admin. The
    // callback is not authenticated (Xero redirects the browser to it), so
    // this is what proves a callback belongs to a flow an admin started here.
    const state = crypto.randomBytes(32).toString('hex');
    await db.query('DELETE FROM xero_oauth_states WHERE expires_at < CURRENT_TIMESTAMP');
    await db.query(
      `INSERT INTO xero_oauth_states (state, user_id, expires_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '${OAUTH_STATE_TTL_MINUTES} minutes')`,
      [state, req.user.id]
    );

    const authUrl = await xeroService.getAuthorizationUrl(state);

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
  const fail = (reason) =>
    res.redirect(`${frontendUrl}/#/xero-settings?connected=false&error=${encodeURIComponent(reason)}`);
  try {
    const { code, error: xeroError } = req.query;
    const state = typeof req.query.state === 'string' ? req.query.state : '';

    // Consume the state: it must be one /connect issued, unexpired and unused
    const claimed = state
      ? await db.query(
          `DELETE FROM xero_oauth_states WHERE state = $1
           RETURNING state, user_id, expires_at > CURRENT_TIMESTAMP AS fresh`,
          [state]
        )
      : { rows: [] };
    const issued = claimed.rows[0];
    if (!issued || !issued.fresh) {
      return fail('This Xero sign-in has expired or was already used. Click "Connect to Xero" to start again.');
    }

    if (xeroError) {
      return fail(xeroError === 'access_denied' ? 'Access was not granted in Xero' : String(xeroError));
    }
    if (!code) {
      return fail('Authorization code missing');
    }

    // The admin/developer who started this flow
    const connectedByUserId = issued.user_id;

    // Build full callback URL for xero-node (it needs the full URL, not just the code)
    const callbackUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

    // Exchange code for tokens, checking the state against the one we issued
    const result = await xeroService.handleCallback(callbackUrl, issued.state);

    if (!result.success) {
      return fail(`Failed to connect to Xero: ${result.error}`);
    }

    // Only organisations can hold a chart of accounts (not practices etc.)
    const tenants = (result.tenants || []).filter(
      (t) => !t.tenantType || t.tenantType === 'ORGANISATION'
    );
    if (tenants.length === 0) {
      return fail('No Xero organisation was authorised');
    }

    const ts = result.tokenSet;
    // All organisations authorised here share this one token set (one grant)
    const grantId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + ((ts.expires_in || 1800) * 1000));
    const accessClaims = decodeJwtPayload(ts.access_token) || {};
    const idClaims = decodeJwtPayload(ts.id_token) || {};
    // The Xero user who signed in. GET /connections lists THIS user's
    // connections to the app, not every organisation the app is connected to,
    // so only this user's organisations can be reconciled against it.
    const xeroUserId = idClaims.xero_userid || accessClaims.xero_userid || null;
    // Identifies the organisations picked on Xero's consent screen this time
    const authEventId = accessClaims.authentication_event_id || null;

    let needsChoice = false;
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1)', [XERO_ORG_LOCK]);

      // The organisation approved expenses sync to - also when its connection
      // has died and it is waiting to be reconnected
      const previous = await client.query(
        `SELECT tenant_id FROM xero_connections
         WHERE is_organization_wide = true AND is_default = true
         ORDER BY is_active DESC, id DESC
         LIMIT 1`
      );
      const previousDefault = previous.rows[0] ? previous.rows[0].tenant_id : null;

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
                 xero_user_id = $12,
                 is_default = false,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $13`,
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
              xeroUserId,
              existing.rows[0].id
            ]
          );
        } else {
          await client.query(
            `INSERT INTO xero_connections (
              user_id, tenant_id, tenant_name, access_token, refresh_token,
              id_token, expires_at, token_type, scope, is_organization_wide, connected_by_user_id,
              grant_id, xero_connection_id, is_demo_company, xero_user_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
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
              isDemo,
              xeroUserId
            ]
          );
        }
      }

      // This Xero user's organisations that are no longer connected to the
      // app. Rows from other Xero users (or from before xero_user_id was
      // recorded) are left alone: their grants are still valid at Xero, and a
      // dead one is detected (invalid_grant) when it is next used.
      const tenantIds = tenants.map((t) => t.tenantId);
      if (xeroUserId) {
        await client.query(
          `UPDATE xero_connections
           SET is_active = false, updated_at = CURRENT_TIMESTAMP
           WHERE is_organization_wide = true AND is_active = true
             AND xero_user_id = $2
             AND NOT (tenant_id = ANY($1::text[]))`,
          [tenantIds, xeroUserId]
        );
      }

      // Choose the organisation to sync to. An existing choice is kept - a
      // new consent never moves postings to another organisation; the admin
      // switches with the selector. If it is not connected after this consent
      // it stays chosen and the Settings page asks for it to be reconnected.
      // Without a choice:
      //  - the single organisation picked in this consent, else
      //  - the only connected organisation, else
      //  - nobody: the Settings page asks the admin to choose.
      if (previousDefault) {
        await setDefaultOrganisation(client, previousDefault);
      } else {
        const pickedNow = authEventId ? tenants.filter((t) => t.authEventId === authEventId) : [];
        const connected = await client.query(
          `SELECT DISTINCT tenant_id FROM xero_connections
           WHERE is_organization_wide = true AND is_active = true`
        );
        if (pickedNow.length === 1) {
          await setDefaultOrganisation(client, pickedNow[0].tenantId);
        } else if (connected.rows.length === 1) {
          await setDefaultOrganisation(client, connected.rows[0].tenant_id);
        } else {
          needsChoice = true;
        }
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

    // The same rule auto-sync uses (services/xeroConnection)
    const chosen = await getDefaultOrganisation();

    res.json({
      connected: connections.length > 0,
      connections,
      // Set only while the chosen organisation is connected
      defaultTenantId: chosen && chosen.active ? chosen.tenantId : null,
      // The chosen organisation's connection died: nothing syncs until it is
      // reconnected or another organisation is chosen
      reconnectRequired: chosen && !chosen.active
        ? { tenantId: chosen.tenantId, tenantName: chosen.tenantName }
        : null,
      needsDefault: connections.length > 0 && !chosen
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

    // Also forgets a chosen organisation that was waiting to be reconnected
    await db.query(
      `UPDATE xero_connections
       SET is_active = false, is_default = false, updated_at = CURRENT_TIMESTAMP
       WHERE is_organization_wide = true AND (is_active = true OR is_default = true)`
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

// ---------------------------------------------------------------------------
// Account profiles: per-store category -> account mappings (e.g. Rent posts
// to 3000 for Ktown and 3001 for Gardena). Employees are assigned a profile on
// the User Management page; their expenses post with it.
// ---------------------------------------------------------------------------

/**
 * The account profile named by a request: { profile } (null for the shared
 * mappings) or { error } when the id is invalid or unknown.
 */
async function findProfile(value) {
  if (value === undefined || value === null || value === '') return { profile: null };
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) return { error: 'Invalid account profile' };
  const result = await db.query('SELECT id, name FROM xero_account_profiles WHERE id = $1', [id]);
  return result.rows[0] ? { profile: result.rows[0] } : { error: 'That account profile no longer exists' };
}

function cleanProfileName(value) {
  return String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
}

// GET /api/xero/profiles - Account profiles with how many employees use each
router.get('/profiles', authMiddleware, isAdminOrDeveloper, async (req, res) => {
  try {
    const [profiles, unassigned] = await Promise.all([
      db.query(
        `SELECT p.id, p.name,
                COUNT(u.id) FILTER (WHERE u.deleted_at IS NULL)::int AS employee_count
         FROM xero_account_profiles p
         LEFT JOIN users u ON u.account_profile_id = p.id
         GROUP BY p.id
         ORDER BY LOWER(p.name)`
      ),
      db.query(
        `SELECT COUNT(*)::int AS n FROM users
         WHERE account_profile_id IS NULL AND deleted_at IS NULL AND is_active = true`
      )
    ]);
    res.json({ profiles: profiles.rows, unassignedEmployees: unassigned.rows[0].n });
  } catch (error) {
    console.error('Get account profiles error:', error);
    res.status(500).json({ error: 'Failed to fetch account profiles' });
  }
});

// POST /api/xero/profiles - Create an account profile
router.post('/profiles', authMiddleware, isAdminOrDeveloper, async (req, res) => {
  const name = cleanProfileName(req.body && req.body.name);
  if (!name) return res.status(400).json({ error: 'Profile name required' });
  if (name.length > 100) return res.status(400).json({ error: 'Profile name is too long' });
  try {
    const result = await db.query(
      'INSERT INTO xero_account_profiles (name) VALUES ($1) RETURNING id, name',
      [name]
    );
    res.status(201).json({ ...result.rows[0], employee_count: 0 });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: `A profile named "${name}" already exists` });
    }
    console.error('Create account profile error:', error);
    res.status(500).json({ error: 'Failed to create account profile' });
  }
});

// PUT /api/xero/profiles/:id - Rename an account profile
router.put('/profiles/:id', authMiddleware, isAdminOrDeveloper, async (req, res) => {
  const name = cleanProfileName(req.body && req.body.name);
  if (!name) return res.status(400).json({ error: 'Profile name required' });
  if (name.length > 100) return res.status(400).json({ error: 'Profile name is too long' });
  try {
    const found = await findProfile(req.params.id);
    if (found.error) return res.status(404).json({ error: found.error });
    const result = await db.query(
      `UPDATE xero_account_profiles SET name = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 RETURNING id, name`,
      [name, found.profile.id]
    );
    res.json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: `A profile named "${name}" already exists` });
    }
    console.error('Rename account profile error:', error);
    res.status(500).json({ error: 'Failed to rename account profile' });
  }
});

// DELETE /api/xero/profiles/:id - Delete a profile no employee uses (its
// mappings go with it)
router.delete('/profiles/:id', authMiddleware, isAdminOrDeveloper, async (req, res) => {
  try {
    const found = await findProfile(req.params.id);
    if (found.error) return res.status(404).json({ error: found.error });

    // Refused while employees use it: their expenses would silently switch to
    // the shared mappings, i.e. possibly another store's accounts
    const used = await db.query(
      `SELECT COUNT(*)::int AS n FROM users
       WHERE account_profile_id = $1 AND deleted_at IS NULL`,
      [found.profile.id]
    );
    if (used.rows[0].n > 0) {
      return res.status(409).json({
        error: `${used.rows[0].n} employee${used.rows[0].n === 1 ? ' uses' : 's use'} the "${found.profile.name}" profile. Assign them another profile in User Management first.`
      });
    }

    await db.query('DELETE FROM xero_account_profiles WHERE id = $1', [found.profile.id]);
    res.json({ message: `Deleted the "${found.profile.name}" profile` });
  } catch (error) {
    console.error('Delete account profile error:', error);
    res.status(500).json({ error: 'Failed to delete account profile' });
  }
});

// GET /api/xero/mappings - For each expense category: what it is mapped to on
// this page, and the account its expenses will actually post to. With
// profileId, for that account profile; without, the shared mappings.
router.get('/mappings', authMiddleware, isAdminOrDeveloper, async (req, res) => {
  try {
    const { tenantId } = req.query;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID required' });
    }
    const found = await findProfile(req.query.profileId);
    if (found.error) {
      return res.status(404).json({ error: found.error });
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

    res.json(await buildMappingOverview(tenantId, chart, found.profile ? found.profile.id : null));

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

    const found = await findProfile(req.body.profileId);
    if (found.error) {
      return res.status(404).json({ error: found.error });
    }
    const profileId = found.profile ? found.profile.id : null;

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

    // Upsert by normalised key within this profile (or the shared mappings);
    // collapse duplicates saved under older key styles
    const existing = await db.query(
      `SELECT id, category FROM xero_account_mappings
       WHERE tenant_id = $1 AND (is_organization_wide = true OR user_id IS NULL)
         AND account_profile_id IS NOT DISTINCT FROM $2
       ORDER BY updated_at DESC NULLS LAST, id DESC`,
      [tenantId, profileId]
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
          user_id, tenant_id, category, xero_account_code, xero_account_name, xero_account_id,
          is_organization_wide, account_profile_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [null, tenantId, key, account.code, account.name, account.accountId, true, profileId]
      );
    }

    res.json({
      message: 'Account mapping saved successfully',
      mapping: { category: key, code: account.code, name: account.name, accountId: account.accountId, profileId }
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
    const profileParam = req.query.profileId !== undefined ? req.query.profileId : (req.body && req.body.profileId);

    if (!tenantId || !category) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const found = await findProfile(profileParam);
    if (found.error) {
      return res.status(404).json({ error: found.error });
    }

    const key = normalizeCategoryKey(category);
    const rows = await db.query(
      `SELECT id, category FROM xero_account_mappings
       WHERE tenant_id = $1 AND (is_organization_wide = true OR user_id IS NULL)
         AND account_profile_id IS NOT DISTINCT FROM $2`,
      [tenantId, found.profile ? found.profile.id : null]
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
        message: `Expense synced to Xero (account ${posted.accountCode}${posted.accountName ? ` - ${posted.accountName}` : ''}${posted.profileName ? `, ${posted.profileName} profile` : ''})`,
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
      `SELECT e.id, e.description, e.amount, e.category, sc.name as subcategory_name, e.date, e.vendor_name,
              e.status, e.xero_invoice_id, e.xero_synced_at, e.xero_sync_error,
              u.first_name || ' ' || u.last_name as submitted_by,
              p.name as account_profile_name
       FROM expenses e
       JOIN users u ON e.user_id = u.id
       LEFT JOIN xero_account_profiles p ON p.id = u.account_profile_id
       LEFT JOIN expense_subcategories sc ON sc.id = e.subcategory_id
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

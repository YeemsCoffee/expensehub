/**
 * Single source of truth for "give me a usable Xero connection".
 *
 * Why this exists
 * ---------------
 * Xero rotates refresh tokens: every successful refresh returns a NEW refresh
 * token and invalidates the old one. The previous code had three separate
 * copies of "read row -> refresh if expiring -> write row" (routes/xero.js,
 * services/xeroAutoSync.js, ...). When two requests ran at once - e.g. two
 * expense approvals each triggering an auto-sync - both read the same refresh
 * token, both called Xero, the second got `invalid_grant (Refresh token not
 * found)`, and a last-write-wins UPDATE could store the now-dead token,
 * bricking the connection until someone reconnected.
 *
 * Fix
 * ---
 *  - Refreshes are serialised with a row lock (SELECT ... FOR UPDATE), which
 *    works across Render instances, and an in-process single-flight so
 *    concurrent callers in one process share a single refresh.
 *  - The expiry is re-checked under the lock, so a waiter that finds the row
 *    already refreshed simply uses the new token.
 *  - `invalid_grant` is permanent: the connection is marked inactive so the
 *    app reports "disconnected / reconnect" instead of failing forever.
 *
 * Grants, not tenants
 * -------------------
 * Xero issues ONE token set per authorisation (grant), valid for every
 * organisation authorised in it; the org is chosen per request. The OAuth
 * callback stores one row per organisation, all carrying the same tokens and
 * the same grant_id. Refreshing therefore locks and updates every row of the
 * grant together - refreshing one row alone would rotate the refresh token out
 * from under its siblings and get them deactivated.
 *
 * Which organisation
 * ------------------
 * Callers name a tenant, or get the admin-chosen default organisation
 * (xero_connections.is_default). It is never chosen by timestamp: that used to
 * make the Settings page and auto-sync use whichever row was written last,
 * often Xero's Demo Company. Nor does it fall back to "the only organisation
 * still connected" when the default's grant dies - that would quietly post to
 * an organisation nobody chose.
 *
 * Note: xeroService is a module singleton whose XeroClient token set is
 * mutated by callers. Every row of a grant holds the same token, so callers
 * setting it concurrently set the same value.
 */
const db = require('../config/database');
const xeroService = require('./xeroService');

const REFRESH_WINDOW_MS = 5 * 60 * 1000; // refresh if expiring within 5 min

// grant key -> Promise of the in-flight refresh (in-process single-flight)
const inFlight = new Map();

function isExpiringSoon(expiresAt) {
  return new Date(expiresAt).getTime() <= Date.now() + REFRESH_WINDOW_MS;
}

function isInvalidGrant(refreshResult) {
  return refreshResult.code === 'invalid_grant' || /invalid_grant/i.test(refreshResult.error || '');
}

/** Rows written before grant_id existed are their own grant. */
function grantKeyOf(row) {
  return row.grant_id || `connection:${row.id}`;
}

/**
 * The organisation the admin chose for syncing, whether or not it is
 * currently connected: { tenantId, tenantName, active } or null if none was
 * chosen. A dead grant deactivates the row but keeps is_default, so the choice
 * survives until it is reconnected or the admin picks another organisation.
 */
async function getDefaultOrganisation() {
  const chosen = await db.query(
    `SELECT tenant_id, tenant_name FROM xero_connections
     WHERE is_organization_wide = true AND is_default = true
     ORDER BY is_active DESC, id DESC
     LIMIT 1`
  );
  if (!chosen.rows[0]) return null;

  const { tenant_id: tenantId, tenant_name: tenantName } = chosen.rows[0];
  const live = await db.query(
    `SELECT 1 FROM xero_connections
     WHERE is_organization_wide = true AND is_active = true AND tenant_id = $1
     LIMIT 1`,
    [tenantId]
  );
  return { tenantId, tenantName, active: live.rows.length > 0 };
}

/**
 * The connection to use: { connection } or { reason }.
 * With a tenantId, that organisation. Without one, the default organisation.
 * If the default is no longer connected the reason is 'reconnect_required',
 * and if none was chosen it is 'no_default' - expenses are never posted to
 * some other organisation that happens to still be connected.
 */
async function findConnection(tenantId) {
  if (!tenantId) {
    const chosen = await getDefaultOrganisation();
    if (!chosen) {
      const anyActive = await db.query(
        `SELECT 1 FROM xero_connections
         WHERE is_organization_wide = true AND is_active = true
         LIMIT 1`
      );
      return { reason: anyActive.rows.length > 0 ? 'no_default' : 'not_connected' };
    }
    if (!chosen.active) {
      return { reason: 'reconnect_required', tenantName: chosen.tenantName };
    }
    tenantId = chosen.tenantId;
  }

  const result = await db.query(
    `SELECT * FROM xero_connections
     WHERE is_organization_wide = true AND is_active = true AND tenant_id = $1
     ORDER BY is_default DESC, id DESC
     LIMIT 1`,
    [tenantId]
  );
  return result.rows[0] ? { connection: result.rows[0] } : { reason: 'not_connected' };
}

/**
 * Refresh the tokens of the grant `connectionId` belongs to, under row locks
 * on every row of that grant. Returns the same shape as getValidXeroConnection,
 * with `connection` being the row for `connectionId`.
 */
async function refreshGrantUnderLock(connectionId) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const head = await client.query(
      'SELECT id, grant_id FROM xero_connections WHERE id = $1',
      [connectionId]
    );
    if (!head.rows[0]) {
      await client.query('ROLLBACK');
      return { connection: null, reason: 'not_connected' };
    }

    // grant_id never changes on refresh, so this lock cannot miss a sibling
    // that a concurrent refresh is updating.
    const grantId = head.rows[0].grant_id;
    const locked = grantId
      ? await client.query(
          'SELECT * FROM xero_connections WHERE grant_id = $1 ORDER BY id FOR UPDATE',
          [grantId]
        )
      : await client.query(
          'SELECT * FROM xero_connections WHERE id = $1 FOR UPDATE',
          [connectionId]
        );

    let row = locked.rows.find((r) => r.id === connectionId);

    if (!row) {
      // A reconnect moved this row to a new grant while we waited; it now
      // holds fresh tokens from that callback.
      const fresh = await client.query('SELECT * FROM xero_connections WHERE id = $1', [connectionId]);
      row = fresh.rows[0];
      await client.query('ROLLBACK');
      if (row && row.is_active && !isExpiringSoon(row.expires_at)) {
        return { connection: row };
      }
      return { connection: null, reason: 'not_connected' };
    }

    if (!row.is_active) {
      await client.query('ROLLBACK');
      return { connection: null, reason: 'not_connected' };
    }

    // Another process may have refreshed the grant while we waited.
    if (!isExpiringSoon(row.expires_at)) {
      await client.query('ROLLBACK'); // nothing written
      return { connection: row };
    }

    console.log(`🔄 [Xero] Refreshing token for grant of tenant ${row.tenant_id} (${locked.rows.length} organisation row(s))`);

    // xero-node needs the (expired) access token present alongside the refresh token
    xeroService.xero.setTokenSet({
      access_token: row.access_token,
      refresh_token: row.refresh_token
    });
    const refreshResult = await xeroService.refreshAccessToken(row.refresh_token);

    const scope = grantId
      ? { where: 'grant_id = $1', param: grantId }
      : { where: 'id = $1', param: connectionId };

    if (refreshResult.success) {
      const ts = refreshResult.tokenSet;
      const updated = await client.query(
        `UPDATE xero_connections
         SET access_token = $2,
             refresh_token = $3,
             expires_at = $4,
             updated_at = CURRENT_TIMESTAMP
         WHERE ${scope.where}
         RETURNING *`,
        [
          scope.param,
          ts.access_token,
          ts.refresh_token || row.refresh_token,
          new Date(Date.now() + (ts.expires_in || 1800) * 1000)
        ]
      );
      await client.query('COMMIT');
      console.log(`✓ [Xero] Token refreshed for tenant ${row.tenant_id}`);
      return { connection: updated.rows.find((r) => r.id === connectionId) || null };
    }

    if (isInvalidGrant(refreshResult)) {
      // The grant is dead (consumed, revoked, or >60 days unused). Nothing can
      // revive it and it covers every org in the grant, so deactivate them
      // all. is_default is kept: syncing stops until the chosen organisation
      // is reconnected, instead of moving to another one still connected.
      await client.query(
        `UPDATE xero_connections
         SET is_active = false, updated_at = CURRENT_TIMESTAMP
         WHERE ${scope.where}`,
        [scope.param]
      );
      await client.query('COMMIT');
      console.error(`✗ [Xero] Refresh token rejected for tenant ${row.tenant_id}; grant marked inactive. Reconnect required.`);
      return { connection: null, reason: 'reconnect_required', tenantName: row.tenant_name, error: refreshResult.error };
    }

    // Transient failure (network, Xero outage): leave the rows alone.
    await client.query('ROLLBACK');
    console.error(`✗ [Xero] Token refresh failed for tenant ${row.tenant_id}:`, refreshResult.error);
    return { connection: null, reason: 'refresh_failed', error: refreshResult.error };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Get an active organisation-wide Xero connection with a valid access token,
 * refreshing its grant if it is about to expire.
 *
 * @param {{ tenantId?: string }} [opts]  A specific organisation; omit for the
 *   default organisation.
 * @returns {Promise<
 *   { connection: object } |
 *   { connection: null, reason: 'not_connected' | 'no_default' | 'reconnect_required' | 'refresh_failed', error?: string }
 * >}
 */
async function getValidXeroConnection({ tenantId } = {}) {
  const found = await findConnection(tenantId);
  if (!found.connection) {
    return { connection: null, reason: found.reason, tenantName: found.tenantName };
  }
  const connection = found.connection;

  if (!isExpiringSoon(connection.expires_at)) {
    return { connection };
  }

  // Single-flight per grant within this process
  const key = grantKeyOf(connection);
  if (!inFlight.has(key)) {
    const p = refreshGrantUnderLock(connection.id).finally(() => inFlight.delete(key));
    inFlight.set(key, p);
  }
  const result = await inFlight.get(key);

  // The shared refresh may have been started for a sibling organisation in the
  // same grant; return this organisation's (now refreshed) row.
  if (result.connection && result.connection.id !== connection.id) {
    const again = await db.query(
      'SELECT * FROM xero_connections WHERE id = $1 AND is_active = true',
      [connection.id]
    );
    return again.rows[0]
      ? { connection: again.rows[0] }
      : { connection: null, reason: 'not_connected' };
  }
  return result;
}

/**
 * Map a failed getValidXeroConnection result to an HTTP response.
 * Deliberately NOT 401: the frontend's api client treats 401 as "your
 * ExpenseHub session is invalid" and logs the user out.
 */
function respondNotConnected(res, result) {
  switch (result.reason) {
    case 'reconnect_required':
      return res.status(409).json({
        error: result.tenantName
          ? `The Xero connection to ${result.tenantName} has expired and must be reconnected.`
          : 'Your Xero connection has expired and must be reconnected.',
        code: 'XERO_RECONNECT_REQUIRED'
      });
    case 'refresh_failed':
      return res.status(502).json({
        error: 'Could not refresh the Xero connection. Please try again shortly.',
        code: 'XERO_REFRESH_FAILED',
        details: result.error
      });
    case 'no_default':
      return res.status(409).json({
        error: 'No Xero organisation is chosen for syncing. Choose one in Settings → Xero Integration.',
        code: 'XERO_CHOOSE_ORG'
      });
    default:
      return res.status(409).json({
        error: 'Not connected to Xero.',
        code: 'XERO_NOT_CONNECTED'
      });
  }
}

module.exports = {
  getValidXeroConnection,
  getDefaultOrganisation,
  respondNotConnected,
  isExpiringSoon,
  grantKeyOf
};

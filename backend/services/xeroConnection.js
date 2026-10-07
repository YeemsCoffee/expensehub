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
 * Note: xeroService is a module singleton whose XeroClient token set is
 * mutated by callers. For an organisation-wide single connection that is
 * benign (every caller sets the same token). The dangerous part - concurrent
 * refreshes - is what this module prevents.
 */
const db = require('../config/database');
const xeroService = require('./xeroService');

const REFRESH_WINDOW_MS = 5 * 60 * 1000; // refresh if expiring within 5 min

// connection id -> Promise of the in-flight refresh (in-process single-flight)
const inFlight = new Map();

function isExpiringSoon(expiresAt) {
  return new Date(expiresAt).getTime() <= Date.now() + REFRESH_WINDOW_MS;
}

function isInvalidGrant(refreshResult) {
  return refreshResult.code === 'invalid_grant' || /invalid_grant/i.test(refreshResult.error || '');
}

async function findConnection(tenantId) {
  const params = [];
  let sql = `SELECT * FROM xero_connections
             WHERE is_organization_wide = true AND is_active = true`;
  if (tenantId) {
    sql += ' AND tenant_id = $1';
    params.push(tenantId);
  }
  sql += ' ORDER BY updated_at DESC LIMIT 1';
  const result = await db.query(sql, params);
  return result.rows[0] || null;
}

/**
 * Refresh one connection's tokens under a row lock.
 * Returns the same shape as getValidXeroConnection.
 */
async function refreshUnderLock(connectionId) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const locked = await client.query(
      'SELECT * FROM xero_connections WHERE id = $1 FOR UPDATE',
      [connectionId]
    );
    const row = locked.rows[0];

    if (!row || !row.is_active) {
      await client.query('ROLLBACK');
      return { connection: null, reason: 'not_connected' };
    }

    // Another process may have refreshed while we waited for the lock.
    if (!isExpiringSoon(row.expires_at)) {
      await client.query('ROLLBACK'); // nothing written
      return { connection: row };
    }

    console.log(`🔄 [Xero] Refreshing token for tenant ${row.tenant_id}`);

    // xero-node needs the (expired) access token present alongside the refresh token
    xeroService.xero.setTokenSet({
      access_token: row.access_token,
      refresh_token: row.refresh_token
    });
    const refreshResult = await xeroService.refreshAccessToken(row.refresh_token);

    if (refreshResult.success) {
      const ts = refreshResult.tokenSet;
      const updated = await client.query(
        `UPDATE xero_connections
         SET access_token = $1,
             refresh_token = $2,
             expires_at = $3,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $4
         RETURNING *`,
        [
          ts.access_token,
          ts.refresh_token || row.refresh_token,
          new Date(Date.now() + (ts.expires_in || 1800) * 1000),
          connectionId
        ]
      );
      await client.query('COMMIT');
      console.log(`✓ [Xero] Token refreshed for tenant ${row.tenant_id}`);
      return { connection: updated.rows[0] };
    }

    if (isInvalidGrant(refreshResult)) {
      // The refresh token is dead (consumed, revoked, or >60 days unused).
      // Nothing can revive it; an admin must reconnect. Mark inactive so
      // /status reports disconnected instead of every call failing.
      await client.query(
        `UPDATE xero_connections
         SET is_active = false, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [connectionId]
      );
      await client.query('COMMIT');
      console.error(`✗ [Xero] Refresh token rejected for tenant ${row.tenant_id}; connection marked inactive. Reconnect required.`);
      return { connection: null, reason: 'reconnect_required', error: refreshResult.error };
    }

    // Transient failure (network, Xero outage): leave the row alone.
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
 * refreshing it if it is about to expire.
 *
 * @param {{ tenantId?: string }} [opts]  Limit to one tenant; omit for "any".
 * @returns {Promise<
 *   { connection: object } |
 *   { connection: null, reason: 'not_connected' | 'reconnect_required' | 'refresh_failed', error?: string }
 * >}
 */
async function getValidXeroConnection({ tenantId } = {}) {
  const connection = await findConnection(tenantId);
  if (!connection) {
    return { connection: null, reason: 'not_connected' };
  }

  if (!isExpiringSoon(connection.expires_at)) {
    return { connection };
  }

  // Single-flight per connection within this process
  if (!inFlight.has(connection.id)) {
    const p = refreshUnderLock(connection.id).finally(() => inFlight.delete(connection.id));
    inFlight.set(connection.id, p);
  }
  return inFlight.get(connection.id);
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
        error: 'Your Xero connection has expired and must be reconnected.',
        code: 'XERO_RECONNECT_REQUIRED'
      });
    case 'refresh_failed':
      return res.status(502).json({
        error: 'Could not refresh the Xero connection. Please try again shortly.',
        code: 'XERO_REFRESH_FAILED',
        details: result.error
      });
    default:
      return res.status(409).json({
        error: 'Not connected to Xero.',
        code: 'XERO_NOT_CONNECTED'
      });
  }
}

module.exports = { getValidXeroConnection, respondNotConnected, isExpiringSoon };

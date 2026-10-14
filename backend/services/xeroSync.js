/**
 * The one path that posts approved expenses to Xero as bills. Used by the
 * manual sync, bulk sync and auto-sync-on-approval, so all three resolve
 * accounts identically (services/xeroAccounts) and record failures the same
 * way.
 */
const db = require('../config/database');
const xeroService = require('./xeroService');
const { getChart, loadMappingContext, resolveExpenseAccount } = require('./xeroAccounts');

// Advisory-lock namespace for "this expense is being posted to Xero"
const XERO_SYNC_LOCK = 7340022;

/** Store a failure on the expense so the Settings page can show it. */
async function recordSyncError(expenseId, message) {
  await db.query(
    `UPDATE expenses
     SET xero_sync_error = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [message, expenseId]
  ).catch(err => console.error(`Failed to record Xero sync error for expense ${expenseId}:`, err));
}

/**
 * Post expenses to the organisation of `connection`.
 *
 * Each expense's account is resolved from its category and checked against
 * the organisation's live chart of accounts before anything is posted. An
 * expense whose category is unmapped, or mapped to an account that is
 * archived, deleted or not postable, fails with an explanation instead of
 * being posted to an account nobody chose.
 *
 * @param {object} connection  active xero_connections row with a valid token
 * @param {Array<object>} expenses  approved expense rows (with first_name/last_name)
 * @returns {Promise<{synced:number, failed:number, skipped:number, details:object}>}
 */
async function syncExpensesToXero(connection, expenses) {
  const tenantId = connection.tenant_id;
  const details = { synced: [], failed: [], skipped: [] };
  const summary = () => ({
    synced: details.synced.length,
    failed: details.failed.length,
    skipped: details.skipped.length,
    details
  });

  if (!expenses.length) return summary();

  xeroService.setAccessToken(connection.access_token, connection.refresh_token);

  // Always validate against the live chart. The cache is per process, so on
  // a multi-instance deploy it can predate a mapping saved on another
  // instance (e.g. to a just-created account). One call per sync batch.
  const chart = await getChart(tenantId, { force: true });
  if (!chart.success) {
    const message = `Could not load the chart of accounts from Xero: ${chart.error}`;
    for (const expense of expenses) {
      await recordSyncError(expense.id, message);
      details.failed.push({ expenseId: expense.id, error: message });
    }
    return summary();
  }

  const ctx = await loadMappingContext(tenantId);

  for (const expense of expenses) {
    // Claim the expense for the whole post. Auto-sync on approval and a
    // manual "Sync"/"Sync All" can run at the same moment; without this both
    // would create a bill. The second waits, re-reads, and sees it is synced.
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1, $2)', [XERO_SYNC_LOCK, expense.id]);
      const fresh = await client.query('SELECT xero_invoice_id FROM expenses WHERE id = $1', [expense.id]);

      if (!fresh.rows[0] || fresh.rows[0].xero_invoice_id) {
        details.skipped.push({ expenseId: expense.id, reason: 'Already synced to Xero' });
        continue;
      }

      const target = resolveExpenseAccount(expense.category, ctx, chart.accounts);
      if (!target.ok) {
        await recordSyncError(expense.id, target.error);
        details.failed.push({ expenseId: expense.id, error: target.error });
        continue;
      }

      // xeroService is a shared singleton; re-assert this connection's token
      // before each post in case another request changed it meanwhile.
      xeroService.setAccessToken(connection.access_token, connection.refresh_token);
      const result = await xeroService.syncExpenseToXero(tenantId, expense, { accountCode: target.code });

      if (result.success) {
        details.synced.push({
          expenseId: expense.id,
          xeroInvoiceId: result.xeroInvoiceId,
          xeroInvoiceNumber: result.xeroInvoiceNumber,
          accountCode: target.code,
          accountName: target.accountName
        });
      } else {
        const message = result.rejectedByXero ? `Xero rejected the bill: ${result.error}` : result.error;
        await recordSyncError(expense.id, message);
        details.failed.push({ expenseId: expense.id, error: message });
      }
    } finally {
      // Releases the advisory lock (transaction-scoped)
      await client.query('COMMIT').catch(() => {});
      client.release();
    }
  }

  return summary();
}

module.exports = { syncExpensesToXero, recordSyncError };

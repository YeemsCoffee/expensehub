/**
 * Auto-sync an approved expense to Xero (organization-wide connection).
 *
 * Extracted from the legacy POST /api/expenses/:id/approve handler so that the
 * org-chart approval path (routes/expenseApprovals.js) gets the same behaviour.
 * Posts to the admin-chosen default organisation via the shared sync path
 * (services/xeroSync), so it resolves accounts exactly like a manual sync.
 */
const db = require('../config/database');
const { getValidXeroConnection } = require('./xeroConnection');
const { syncExpensesToXero, recordSyncError } = require('./xeroSync');

const CONNECTION_ERRORS = {
  reconnect_required: (conn) =>
    `The Xero connection${conn.tenantName ? ` to ${conn.tenantName}` : ''} expired - an admin must reconnect it in Settings → Xero Integration, then sync again`,
  no_default: () =>
    'No Xero organisation is chosen for syncing - choose one in Settings → Xero Integration, then sync again'
};

async function autoSyncExpenseToXero(expenseId) {
  const expenseResult = await db.query(
    `SELECT e.*, u.first_name, u.last_name, u.email
     FROM expenses e
     JOIN users u ON e.user_id = u.id
     WHERE e.id = $1 AND e.status = 'approved'`,
    [expenseId]
  );
  const approvedExpense = expenseResult.rows[0];
  if (!approvedExpense) {
    return;
  }

  try {
    // Default organisation only - never "whichever row was updated last"
    const conn = await getValidXeroConnection();

    if (!conn.connection) {
      if (conn.reason === 'not_connected') {
        return; // Xero not connected; nothing to do.
      }
      const describe = CONNECTION_ERRORS[conn.reason];
      const message = describe ? describe(conn) : ('Xero token refresh failed: ' + conn.error);
      console.error(`✗ [Xero auto-sync] ${message} (expense ${approvedExpense.id})`);
      await recordSyncError(approvedExpense.id, message);
      return;
    }

    const result = await syncExpensesToXero(conn.connection, [approvedExpense]);

    if (result.synced) {
      const posted = result.details.synced[0];
      console.log(`✓ [Xero auto-sync] Synced expense ${approvedExpense.id} to account ${posted.accountCode}`);
    } else if (result.failed) {
      console.error(`✗ [Xero auto-sync] Failed for expense ${approvedExpense.id}:`, result.details.failed[0].error);
    }
  } catch (syncError) {
    console.error(`[Xero auto-sync] Error for expense ${approvedExpense.id}:`, syncError);
    await recordSyncError(approvedExpense.id, syncError.message || 'Unexpected error syncing to Xero');
  }
}

/** Fire-and-forget wrapper for use inside request handlers. */
function scheduleXeroAutoSync(expenseId) {
  setImmediate(() => {
    autoSyncExpenseToXero(expenseId)
      .catch(err => console.error(`[Xero auto-sync] Unhandled error for expense ${expenseId}:`, err));
  });
}

module.exports = { autoSyncExpenseToXero, scheduleXeroAutoSync };

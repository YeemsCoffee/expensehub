/**
 * Auto-sync an approved expense to Xero (organization-wide connection).
 *
 * Extracted from the legacy POST /api/expenses/:id/approve handler so that the
 * org-chart approval path (routes/expenseApprovals.js) gets the same behaviour.
 */
const db = require('../config/database');
const xeroService = require('./xeroService');
const { getValidXeroConnection } = require('./xeroConnection');

async function recordSyncError(expenseId, message) {
  await db.query(
    `UPDATE expenses
     SET xero_sync_error = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [message, expenseId]
  ).catch(err => console.error(`Failed to record Xero sync error for expense ${expenseId}:`, err));
}

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
    // Shared, lock-serialised connection lookup (see services/xeroConnection)
    const conn = await getValidXeroConnection();

    if (!conn.connection) {
      if (conn.reason === 'not_connected') {
        return; // Xero not connected; nothing to do.
      }
      const message = conn.reason === 'reconnect_required'
        ? 'Xero connection expired - an admin must reconnect Xero in Settings'
        : 'Xero token refresh failed: ' + conn.error;
      console.error(`✗ [Xero auto-sync] ${message} (expense ${approvedExpense.id})`);
      await recordSyncError(approvedExpense.id, message);
      return;
    }

    const connection = conn.connection;
    const tenantId = connection.tenant_id;

    xeroService.setAccessToken(connection.access_token, connection.refresh_token);

    const mappingsResult = await db.query(
      `SELECT category, xero_account_code
       FROM xero_account_mappings
       WHERE is_organization_wide = true AND tenant_id = $1`,
      [tenantId]
    );

    const mapping = {
      categoryMapping: {},
      dbCategoryMappings: {},
      defaultExpenseAccount: '400',
      defaultTaxType: 'NONE'
    };

    mappingsResult.rows.forEach(row => {
      mapping.categoryMapping[row.category] = row.xero_account_code;
    });

    try {
      const dbCategories = await db.query(
        'SELECT name, xero_account_code FROM expense_categories WHERE is_active = true AND xero_account_code IS NOT NULL'
      );
      dbCategories.rows.forEach(row => {
        mapping.dbCategoryMappings[row.name] = row.xero_account_code;
      });
    } catch (catErr) {
      console.log('Note: expense_categories table not available, using defaults');
    }

    const syncResult = await xeroService.syncExpense(tenantId, approvedExpense, mapping);

    if (syncResult.success) {
      console.log(`✓ [Xero auto-sync] Synced expense ${approvedExpense.id}`);
    } else {
      console.error(`✗ [Xero auto-sync] Failed for expense ${approvedExpense.id}:`, syncResult.error);
      await recordSyncError(approvedExpense.id, syncResult.error);
    }
  } catch (syncError) {
    console.error(`[Xero auto-sync] Error for expense ${approvedExpense.id}:`, syncError);
    await recordSyncError(approvedExpense.id, syncError.message);
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

/**
 * Auto-sync an approved expense to Xero (organization-wide connection).
 *
 * Extracted from the legacy POST /api/expenses/:id/approve handler so that the
 * org-chart approval path (routes/expenseApprovals.js) gets the same behaviour.
 */
const db = require('../config/database');
const xeroService = require('./xeroService');

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
    const xeroConnection = await db.query(
      `SELECT * FROM xero_connections
       WHERE is_organization_wide = true AND is_active = true
       LIMIT 1`
    );

    if (xeroConnection.rows.length === 0) {
      return; // Xero not connected; nothing to do.
    }

    const connection = xeroConnection.rows[0];
    const tenantId = connection.tenant_id;

    // Refresh token if it expires within five minutes
    const expiresAt = new Date(connection.expires_at);
    const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);

    if (expiresAt <= fiveMinutesFromNow) {
      console.log(`🔄 [Xero auto-sync] Refreshing token for expense ${approvedExpense.id}`);

      // Must include expired access_token for XeroClient
      xeroService.xero.setTokenSet({
        access_token: connection.access_token,
        refresh_token: connection.refresh_token
      });
      const refreshResult = await xeroService.refreshAccessToken(connection.refresh_token);

      if (!refreshResult.success) {
        console.error('✗ [Xero auto-sync] Token refresh failed:', refreshResult.error);
        await recordSyncError(approvedExpense.id, 'Xero token refresh failed: ' + refreshResult.error);
        return;
      }

      await db.query(
        `UPDATE xero_connections
         SET access_token = $1, refresh_token = $2, expires_at = $3, updated_at = CURRENT_TIMESTAMP
         WHERE id = $4`,
        [
          refreshResult.tokenSet.access_token,
          refreshResult.tokenSet.refresh_token || connection.refresh_token,
          new Date(Date.now() + refreshResult.tokenSet.expires_in * 1000),
          connection.id
        ]
      );
      connection.access_token = refreshResult.tokenSet.access_token;
      connection.refresh_token = refreshResult.tokenSet.refresh_token || connection.refresh_token;
    }

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

const { XeroClient } = require('xero-node');
const db = require('../config/database');

/**
 * xero-node API methods reject with a JSON *string*
 * (`JSON.stringify(errorResponse.generateError())`), so `error.message` is
 * undefined and Xero's validation messages were being lost. Normalise any
 * rejection into { message, statusCode, body }.
 */
function parseXeroError(error) {
  let e = error;
  if (typeof e === 'string') {
    try {
      e = JSON.parse(e);
    } catch (parseErr) {
      return { message: e, statusCode: null, body: null };
    }
  }

  const statusCode = (e && e.response && e.response.statusCode) || (e && e.statusCode) || null;
  const body = (e && e.response && e.response.body) || (e && e.body) || null;

  const messages = [];
  if (body && typeof body === 'object') {
    for (const element of body.Elements || []) {
      for (const v of element.ValidationErrors || []) {
        if (v && v.Message) messages.push(v.Message);
      }
    }
    if (!messages.length && body.Detail) messages.push(body.Detail);
    if (!messages.length && body.Message) messages.push(body.Message);
    if (!messages.length && body.Title) messages.push(body.Title);
  } else if (typeof body === 'string' && body.trim()) {
    messages.push(body.trim());
  }
  if (!messages.length && e && e.message) messages.push(e.message);

  const message = messages.length
    ? [...new Set(messages)].join('; ')
    : (statusCode ? `Xero API error (HTTP ${statusCode})` : 'Unknown Xero API error');

  return { message, statusCode, body };
}

class XeroService {
  constructor() {
    this.xero = new XeroClient({
      clientId: process.env.XERO_CLIENT_ID,
      clientSecret: process.env.XERO_CLIENT_SECRET,
      redirectUris: [process.env.XERO_REDIRECT_URI || 'http://localhost:5000/api/xero/callback'],
      scopes: [
        'openid',
        'profile',
        'email',
        'accounting.transactions',
        'accounting.contacts',
        'accounting.settings',
        'offline_access'
      ]
    });
  }

  /**
   * Get authorization URL for OAuth flow
   * @param {string} state - State parameter for OAuth (optional)
   * @returns {Promise<string>} Authorization URL
   */
  async getAuthorizationUrl(state) {
    // Set state if provided (for user context)
    if (state) {
      this.xero.config.state = state;
    }
    return await this.xero.buildConsentUrl();
  }

  /**
   * Handle OAuth callback and exchange code for tokens
   * @param {string} callbackUrl - Full callback URL with query parameters
   * @param {string} expectedState - The state this app issued for the flow,
   *   as looked up server-side by the caller. Never the request's own state:
   *   openid-client compares the callback's state with this value.
   * @returns {Promise<Object>} Token set
   */
  async handleCallback(callbackUrl, expectedState) {
    try {
      if (!expectedState) {
        throw new Error('OAuth state was not verified');
      }

      // apiCallback reads config.state as its expected state. Create the
      // OpenID client first so nothing is awaited between setting the state
      // and that read (this client object is shared by concurrent requests).
      await this.ensureOpenIdClient();
      this.xero.config.state = expectedState;

      const tokenSet = await this.xero.apiCallback(callbackUrl);

      // Get connected tenants (organizations)
      await this.xero.updateTenants();
      const tenants = this.xero.tenants;

      return {
        success: true,
        tokenSet,
        tenants
      };
    } catch (error) {
      console.error('Xero OAuth error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Refresh access token using refresh token
   * @param {string} refreshToken - Refresh token
   * @returns {Promise<Object>} New token set
   */
  async refreshAccessToken(refreshToken) {
    try {
      console.log('🔄 Attempting to refresh Xero token...');

      // Ensure we have a valid token set before refreshing
      const currentTokenSet = this.xero.readTokenSet();
      if (!currentTokenSet || !currentTokenSet.refresh_token) {
        throw new Error('No refresh token available in token set');
      }

      console.log('Current token set has refresh_token:', !!currentTokenSet.refresh_token);

      // Check if openIdClient is initialized (common issue with xero-node)
      if (!this.xero.openIdClient) {
        console.log('⚠️  OpenIdClient not initialized, reinitializing XeroClient...');
        // Reinitialize by calling buildConsentUrl which initializes openIdClient
        await this.xero.buildConsentUrl();
        // Reset the token set after reinitialization
        this.xero.setTokenSet(currentTokenSet);
      }

      // Call refresh on the xero client
      const newTokenSet = await this.xero.refreshToken();

      console.log('✓ Token refresh successful');
      return { success: true, tokenSet: newTokenSet };
    } catch (error) {
      console.error('✗ Xero token refresh error:', error.message);
      // openid-client raises OPError with .error = 'invalid_grant' when the
      // refresh token has been consumed/revoked. Surface it so callers can
      // tell a dead token from a transient failure.
      return { success: false, error: error.message, code: error.error || null };
    }
  }

  /**
   * Set access token for API calls
   * Note: This should only be used when the full token set is not available
   * @param {string} accessToken - Access token
   * @param {string} refreshToken - Refresh token (optional, will be preserved if not provided)
   */
  setAccessToken(accessToken, refreshToken = null) {
    // Get current token set to preserve refresh_token if not explicitly provided
    const currentTokenSet = this.xero.readTokenSet();

    this.xero.setTokenSet({
      access_token: accessToken,
      refresh_token: refreshToken || currentTokenSet?.refresh_token
    });
  }

  /**
   * xero-node only creates its OpenID client in buildConsentUrl(); refresh
   * and revoke need it, so make sure it exists without losing the token set.
   */
  async ensureOpenIdClient() {
    if (!this.xero.openIdClient) {
      const currentTokenSet = this.xero.readTokenSet();
      await this.xero.buildConsentUrl();
      if (currentTokenSet) {
        this.xero.setTokenSet(currentTokenSet);
      }
    }
  }

  /**
   * Revoke an OAuth grant at Xero (disconnects every organisation it covers).
   * Best effort: the caller deactivates the local connection regardless.
   */
  async revokeGrant(accessToken, refreshToken) {
    try {
      this.xero.setTokenSet({ access_token: accessToken, refresh_token: refreshToken });
      await this.ensureOpenIdClient();
      await this.xero.revokeToken();
      return { success: true };
    } catch (error) {
      const parsed = parseXeroError(error);
      console.error('Xero token revoke error:', parsed.message);
      return { success: false, error: parsed.message };
    }
  }

  /**
   * Get the organisation's full chart of accounts (every type and status;
   * filtering for what can be posted to happens in services/xeroAccounts).
   * @param {string} tenantId - Xero organization ID
   * @returns {Promise<Object>} { success, accounts } or { success: false, error, statusCode }
   */
  async getChartOfAccounts(tenantId) {
    try {
      const response = await this.xero.accountingApi.getAccounts(tenantId);

      const accounts = (response.body.accounts || []).map(account => ({
        accountId: account.accountID,
        code: account.code || null,
        name: account.name,
        type: account.type,
        // xero-node maps the wire field "Class" to `_class`; `account.class`
        // is always undefined.
        class: account._class || null,
        status: account.status,
        taxType: account.taxType,
        systemAccount: account.systemAccount || null,
        description: account.description || null
      }));

      // Xero's order is not guaranteed; sort by code the way its chart does
      accounts.sort((a, b) => {
        if (!a.code && !b.code) return String(a.name).localeCompare(String(b.name));
        if (!a.code) return 1;
        if (!b.code) return -1;
        return a.code.localeCompare(b.code, undefined, { numeric: true });
      });

      return { success: true, accounts };
    } catch (error) {
      const parsed = parseXeroError(error);
      console.error('Error fetching Xero accounts:', parsed.message);
      return { success: false, error: parsed.message, statusCode: parsed.statusCode };
    }
  }

  /**
   * Get Xero contacts (suppliers/customers)
   * @param {string} tenantId - Xero organization ID
   * @returns {Promise<Object>} Contacts list
   */
  async getContacts(tenantId) {
    try {
      const response = await this.xero.accountingApi.getContacts(tenantId);

      const contacts = response.body.contacts.map(contact => ({
        contactId: contact.contactID,
        name: contact.name,
        isSupplier: contact.isSupplier,
        isCustomer: contact.isCustomer,
        emailAddress: contact.emailAddress
      }));

      return { success: true, contacts };
    } catch (error) {
      console.error('Error fetching Xero contacts:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Create or get contact in Xero
   * @param {string} tenantId - Xero organization ID
   * @param {string} vendorName - Vendor name
   * @returns {Promise<string>} Contact ID
   */
  async getOrCreateContact(tenantId, vendorName) {
    try {
      // Search for existing contact
      const searchResponse = await this.xero.accountingApi.getContacts(
        tenantId,
        undefined,
        `Name=="${vendorName}"`
      );

      if (searchResponse.body.contacts && searchResponse.body.contacts.length > 0) {
        return searchResponse.body.contacts[0].contactID;
      }

      // Create new contact if not found
      const contact = {
        name: vendorName,
        isSupplier: true
      };

      const createResponse = await this.xero.accountingApi.createContacts(
        tenantId,
        { contacts: [contact] }
      );

      return createResponse.body.contacts[0].contactID;
    } catch (error) {
      console.error('Error creating Xero contact:', error);
      throw error;
    }
  }

  /**
   * Sync expense to Xero as an expense claim (for reimbursable expenses)
   * NOTE: Not currently used - reimbursable expenses are created as bills payable to employee instead
   * Kept for future reference if Xero user mapping is implemented
   * @param {string} tenantId - Xero organization ID
   * @param {Object} expense - Expense data
   * @param {{accountCode: string, taxType?: string}} options - Resolved, validated account (services/xeroAccounts)
   * @param {string} userId - Xero user ID for expense claim
   * @returns {Promise<Object>} Sync result
   */
  async syncExpenseClaimToXero(tenantId, expense, options, userId) {
    try {
      const { accountCode, taxType = 'NONE' } = options || {};
      if (!accountCode) {
        return { success: false, error: 'No Xero account code was resolved for this expense' };
      }

      // Build line items for expense claim
      const receiptLines = [];

      if (expense.line_items && expense.line_items.length > 0) {
        // Use actual line items from receipt
        expense.line_items.forEach(item => {
          receiptLines.push({
            description: item.description,
            quantity: item.quantity || 1,
            unitAmount: item.unitPrice || item.total,
            accountCode,
            taxType
          });
        });
      } else {
        // Create single line item for total
        receiptLines.push({
          description: expense.description || 'Expense',
          quantity: 1,
          unitAmount: expense.amount,
          accountCode,
          taxType
        });
      }

      // Create receipt for expense claim
      const receipt = {
        date: expense.date,
        lineAmountTypes: 'NoTax',
        user: { userID: userId },
        receipts: [{
          date: expense.date,
          contact: {
            name: `${expense.first_name} ${expense.last_name}`
          },
          lineItems: receiptLines,
          reference: expense.id ? `Expense #${expense.id}` : undefined,
          status: expense.status === 'approved' ? 'SUBMITTED' : 'DRAFT'
        }]
      };

      const response = await this.xero.accountingApi.createExpenseClaims(
        tenantId,
        { expenseClaims: [receipt] }
      );

      const createdClaim = response.body.expenseClaims[0];

      // Update expense with Xero info
      await db.query(
        `UPDATE expenses
         SET xero_invoice_id = $1,
             xero_synced_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [createdClaim.expenseClaimID, expense.id]
      );

      return {
        success: true,
        xeroExpenseClaimId: createdClaim.expenseClaimID,
        total: createdClaim.total
      };

    } catch (error) {
      const parsed = parseXeroError(error);
      console.error('Error syncing expense claim to Xero:', parsed.message);
      return {
        success: false,
        error: parsed.message,
        details: parsed.body
      };
    }
  }

  /**
   * Sync expense to Xero as a bill (accounts payable).
   *
   * The account must already be resolved and validated against the live chart
   * (services/xeroAccounts.resolveExpenseAccount). There is deliberately no
   * fallback code: posting to an account nobody chose is worse than failing.
   *
   * @param {string} tenantId - Xero organization ID
   * @param {Object} expense - Expense data
   * @param {{accountCode: string, taxType?: string}} options
   * @returns {Promise<Object>} Sync result
   */
  async syncExpenseToXero(tenantId, expense, options) {
    const { accountCode, taxType = 'NONE' } = options || {};
    if (!accountCode) {
      return { success: false, error: 'No Xero account code was resolved for this expense' };
    }

    try {
      // Determine contact based on reimbursable flag
      let contactName;
      let billDescription;

      if (expense.is_reimbursable) {
        // For reimbursable expenses, bill is payable to employee
        contactName = `${expense.first_name} ${expense.last_name}`;
        billDescription = `[REIMBURSABLE] ${expense.description}`;
      } else {
        // For non-reimbursable expenses, bill is payable to vendor
        contactName = expense.vendor_name || 'Unknown Vendor';
        billDescription = expense.description;
      }

      // Get or create contact
      const contactId = await this.getOrCreateContact(tenantId, contactName);

      // Build line items
      const lineItems = [];

      if (expense.line_items && expense.line_items.length > 0) {
        // Use actual line items from receipt; every line belongs to the
        // expense's category account
        expense.line_items.forEach(item => {
          lineItems.push({
            description: item.description,
            quantity: item.quantity || 1,
            unitAmount: item.unitPrice || item.total,
            accountCode,
            taxType
          });
        });
      } else {
        // Create single line item for total
        lineItems.push({
          description: billDescription || 'Expense',
          quantity: 1,
          unitAmount: expense.amount,
          accountCode,
          taxType
        });
      }

      // Create bill in Xero
      const bill = {
        type: 'ACCPAY', // Accounts Payable (bill)
        contact: { contactID: contactId },
        date: expense.date,
        dueDate: expense.date, // Same as expense date for reimbursements
        lineItems: lineItems,
        reference: expense.id ? `Expense #${expense.id}` : undefined,
        status: expense.status === 'approved' ? 'AUTHORISED' : 'DRAFT'
      };

      let createdBill;
      try {
        const response = await this.xero.accountingApi.createInvoices(
          tenantId,
          { invoices: [bill] }
        );
        createdBill = response.body.invoices[0];
      } catch (error) {
        const parsed = parseXeroError(error);
        console.error(`Xero rejected the bill for expense ${expense.id}:`, parsed.message);
        return { success: false, rejectedByXero: true, error: parsed.message, details: parsed.body };
      }

      // The bill now exists in Xero. A failure from here on must not be
      // reported as a rejection - that invites a retry and a duplicate bill.
      try {
        await db.query(
          `UPDATE expenses
           SET xero_invoice_id = $1,
               xero_synced_at = CURRENT_TIMESTAMP,
               xero_sync_error = NULL,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2 AND xero_invoice_id IS NULL`,
          [createdBill.invoiceID, expense.id]
        );
      } catch (dbError) {
        console.error(`Bill ${createdBill.invoiceID} created in Xero for expense ${expense.id} but not recorded:`, dbError.message);
        return {
          success: false,
          billCreated: true,
          xeroInvoiceId: createdBill.invoiceID,
          error: `Bill ${createdBill.invoiceNumber || createdBill.invoiceID} was created in Xero, but ExpenseHub could not record it (${dbError.message}). Check Xero before syncing this expense again, to avoid a duplicate bill.`
        };
      }

      return {
        success: true,
        xeroInvoiceId: createdBill.invoiceID,
        xeroInvoiceNumber: createdBill.invoiceNumber,
        total: createdBill.total
      };

    } catch (error) {
      // Before any bill was created (e.g. contact lookup/creation failed)
      const parsed = parseXeroError(error);
      console.error(`Error syncing expense ${expense.id} to Xero:`, parsed.message);
      return {
        success: false,
        error: parsed.message,
        details: parsed.body
      };
    }
  }

  /**
   * Get Xero organization info
   * @param {string} tenantId - Xero organization ID
   * @returns {Promise<Object>} Organization info
   */
  async getOrganization(tenantId) {
    try {
      const response = await this.xero.accountingApi.getOrganisations(tenantId);
      const org = response.body.organisations[0];

      return {
        success: true,
        organization: {
          name: org.name,
          legalName: org.legalName,
          baseCurrency: org.baseCurrency,
          countryCode: org.countryCode,
          organisationID: org.organisationID
        }
      };
    } catch (error) {
      const parsed = parseXeroError(error);
      console.error('Error fetching Xero organization:', parsed.message);
      return { success: false, error: parsed.message };
    }
  }
}

// Export singleton instance
module.exports = new XeroService();
module.exports.parseXeroError = parseXeroError;

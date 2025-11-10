const { XeroClient } = require('xero-node');
const db = require('../config/database');

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
   * @param {string} state - State parameter for validation
   * @returns {Promise<Object>} Token set
   */
  async handleCallback(callbackUrl, state) {
    try {
      // Set state in config for validation
      if (state) {
        this.xero.config.state = state;
      }

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
      const tokenSet = await this.xero.refreshToken();
      return { success: true, tokenSet };
    } catch (error) {
      console.error('Xero token refresh error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Set access token for API calls
   * @param {string} accessToken - Access token
   */
  setAccessToken(accessToken) {
    this.xero.setTokenSet({ access_token: accessToken });
  }

  /**
   * Get Xero chart of accounts
   * @param {string} tenantId - Xero organization ID
   * @returns {Promise<Object>} Chart of accounts
   */
  async getChartOfAccounts(tenantId) {
    try {
      const response = await this.xero.accountingApi.getAccounts(tenantId);

      const accounts = response.body.accounts.map(account => ({
        accountId: account.accountID,
        code: account.code,
        name: account.name,
        type: account.type,
        taxType: account.taxType,
        status: account.status,
        class: account.class
      }));

      return { success: true, accounts };
    } catch (error) {
      console.error('Error fetching Xero accounts:', error);
      return { success: false, error: error.message };
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
   * Sync expense to Xero (auto-detects whether to create expense claim or bill)
   * @param {string} tenantId - Xero organization ID
   * @param {Object} expense - Expense data
   * @param {Object} mapping - Account mapping configuration
   * @param {string} xeroUserId - Xero user ID (for expense claims)
   * @returns {Promise<Object>} Sync result
   */
  async syncExpense(tenantId, expense, mapping, xeroUserId = null) {
    try {
      // Check if this is a reimbursable expense
      if (expense.is_reimbursable) {
        // Create Xero Expense Claim
        if (!xeroUserId) {
          return {
            success: false,
            error: 'Xero User ID required for expense claims'
          };
        }
        return await this.syncExpenseClaimToXero(tenantId, expense, mapping, xeroUserId);
      } else {
        // Create Xero Bill (ACCPAY)
        return await this.syncExpenseToXero(tenantId, expense, mapping);
      }
    } catch (error) {
      console.error('Error syncing expense:', error);
      return {
        success: false,
        error: error.message,
        details: error.response?.body
      };
    }
  }

  /**
   * Sync expense to Xero as an expense claim (for reimbursable expenses)
   * @param {string} tenantId - Xero organization ID
   * @param {Object} expense - Expense data
   * @param {Object} mapping - Account mapping configuration
   * @param {string} userId - Xero user ID for expense claim
   * @returns {Promise<Object>} Sync result
   */
  async syncExpenseClaimToXero(tenantId, expense, mapping, userId) {
    try {
      // Build line items for expense claim
      const receiptLines = [];

      if (expense.line_items && expense.line_items.length > 0) {
        // Use actual line items from receipt
        expense.line_items.forEach(item => {
          receiptLines.push({
            description: item.description,
            quantity: item.quantity || 1,
            unitAmount: item.unitPrice || item.total,
            accountCode: mapping.defaultExpenseAccount || '400',
            taxType: mapping.defaultTaxType || 'NONE'
          });
        });
      } else {
        // Create single line item for total
        receiptLines.push({
          description: expense.description || 'Expense',
          quantity: 1,
          unitAmount: expense.amount,
          accountCode: this.mapCategoryToAccount(expense.category, mapping),
          taxType: mapping.defaultTaxType || 'NONE'
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
      console.error('Error syncing expense claim to Xero:', error);
      return {
        success: false,
        error: error.message,
        details: error.response?.body
      };
    }
  }

  /**
   * Sync expense to Xero as a bill (accounts payable)
   * @param {string} tenantId - Xero organization ID
   * @param {Object} expense - Expense data
   * @param {Object} mapping - Account mapping configuration
   * @returns {Promise<Object>} Sync result
   */
  async syncExpenseToXero(tenantId, expense, mapping) {
    try {
      // Get or create contact for vendor
      const contactId = await this.getOrCreateContact(tenantId, expense.vendor_name || 'Unknown Vendor');

      // Build line items
      const lineItems = [];

      if (expense.line_items && expense.line_items.length > 0) {
        // Use actual line items from receipt
        expense.line_items.forEach(item => {
          lineItems.push({
            description: item.description,
            quantity: item.quantity || 1,
            unitAmount: item.unitPrice || item.total,
            accountCode: mapping.defaultExpenseAccount || '400', // Default expense account
            taxType: mapping.defaultTaxType || 'NONE'
          });
        });
      } else {
        // Create single line item for total
        lineItems.push({
          description: expense.description || 'Expense',
          quantity: 1,
          unitAmount: expense.amount,
          accountCode: this.mapCategoryToAccount(expense.category, mapping),
          taxType: mapping.defaultTaxType || 'NONE'
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

      const response = await this.xero.accountingApi.createInvoices(
        tenantId,
        { invoices: [bill] }
      );

      const createdBill = response.body.invoices[0];

      // Update expense with Xero info
      await db.query(
        `UPDATE expenses
         SET xero_invoice_id = $1,
             xero_synced_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [createdBill.invoiceID, expense.id]
      );

      return {
        success: true,
        xeroInvoiceId: createdBill.invoiceID,
        xeroInvoiceNumber: createdBill.invoiceNumber,
        total: createdBill.total
      };

    } catch (error) {
      console.error('Error syncing expense to Xero:', error);
      return {
        success: false,
        error: error.message,
        details: error.response?.body
      };
    }
  }

  /**
   * Map expense category to Xero account code
   * @param {string} category - Expense category
   * @param {Object} mapping - Account mapping configuration
   * @returns {string} Xero account code
   */
  mapCategoryToAccount(category, mapping) {
    // Use custom mapping if provided
    if (mapping.categoryMapping && mapping.categoryMapping[category]) {
      return mapping.categoryMapping[category];
    }

    // Default account codes (customize based on your chart of accounts)
    const defaultMapping = {
      'meals': '420',
      'meals_entertainment': '420',
      'travel': '493',
      'car_rental': '404',
      'fuel': '404',
      'office_supplies': '461',
      'software': '453',
      'equipment': '630',
      'professional_services': '404',
      'marketing': '400',
      'internet': '445',
      'utilities': '445',
      'other': '404'
    };

    return defaultMapping[category] || mapping.defaultExpenseAccount || '400';
  }

  /**
   * Bulk sync multiple expenses to Xero
   * @param {string} tenantId - Xero organization ID
   * @param {Array} expenses - Array of expenses
   * @param {Object} mapping - Account mapping configuration
   * @returns {Promise<Object>} Bulk sync result
   */
  async bulkSyncExpenses(tenantId, expenses, mapping) {
    const results = {
      success: [],
      failed: []
    };

    for (const expense of expenses) {
      const result = await this.syncExpenseToXero(tenantId, expense, mapping);

      if (result.success) {
        results.success.push({
          expenseId: expense.id,
          xeroInvoiceId: result.xeroInvoiceId
        });
      } else {
        results.failed.push({
          expenseId: expense.id,
          error: result.error
        });
      }
    }

    return {
      success: true,
      synced: results.success.length,
      failed: results.failed.length,
      details: results
    };
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
      console.error('Error fetching Xero organization:', error);
      return { success: false, error: error.message };
    }
  }
}

// Export singleton instance
module.exports = new XeroService();

import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircle, XCircle, ExternalLink, RefreshCw, Save, AlertTriangle, Upload } from 'lucide-react';
import { formatCurrency } from '../utils/helpers';
import api from '../services/api';

const XeroSettings = () => {
  const [connected, setConnected] = useState(false);
  const [connections, setConnections] = useState([]);
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [mappings, setMappings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [hasPermission, setHasPermission] = useState(false);
  const [expenses, setExpenses] = useState([]);
  const [loadingExpenses, setLoadingExpenses] = useState(false);
  const [syncingIds, setSyncingIds] = useState(new Set());
  const [bulkSyncing, setBulkSyncing] = useState(false);

  // Check user role on mount
  useEffect(() => {
    const userStr = localStorage.getItem('user');
    const user = userStr ? JSON.parse(userStr) : null;
    const role = user?.role || localStorage.getItem('role');

    if (role === 'admin' || role === 'developer') {
      setHasPermission(true);
    } else {
      setHasPermission(false);
      setLoading(false);
      setMessage({
        type: 'error',
        text: `Access denied. Only admin or developer users can access Xero settings. Your current role: ${role || 'unknown'}`
      });
    }
  }, []);

  const [categories, setCategories] = useState([
    { id: 'meals', label: 'Meals' },
    { id: 'meals_entertainment', label: 'Meals & Entertainment' },
    { id: 'travel', label: 'Travel' },
    { id: 'car_rental', label: 'Car Rental' },
    { id: 'fuel', label: 'Fuel' },
    { id: 'office_supplies', label: 'Office Supplies' },
    { id: 'software', label: 'Software' },
    { id: 'equipment', label: 'Equipment' },
    { id: 'professional_services', label: 'Professional Services' },
    { id: 'marketing', label: 'Marketing' },
    { id: 'internet', label: 'Internet' },
    { id: 'utilities', label: 'Utilities' },
    { id: 'other', label: 'Other' }
  ]);

  // Fetch categories from database
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await api.get('/expense-categories');
        if (Array.isArray(response.data) && response.data.length > 0) {
          setCategories(response.data.map(c => ({
            id: c.name.toLowerCase().replace(/[&\s]+/g, '_'),
            label: c.name
          })));
        }
      } catch (err) {
        console.error('Error fetching categories, using defaults:', err);
      }
    };
    if (hasPermission) {
      fetchCategories();
    }
  }, [hasPermission]);

  const checkStatus = async () => {
    try {
      // Wait a bit for auth to be restored after OAuth redirect
      await new Promise(resolve => setTimeout(resolve, 100));

      const response = await api.get('/xero/status');
      setConnected(response.data.connected);
      setConnections(response.data.connections || []);

      if (response.data.connections && response.data.connections.length > 0) {
        setSelectedTenant(response.data.connections[0].tenant_id);
      }
    } catch (error) {
      console.error('Error checking Xero status:', error);
      // Don't let auth errors here trigger logout - user might be in OAuth flow
      if (error.response?.status === 401) {
        console.warn('Authentication required for Xero settings');
      }
    } finally {
      setLoading(false);
    }
  };

  const connectToXero = async () => {
    try {
      const response = await api.get('/xero/connect');
      // Redirect to Xero auth URL
      window.location.href = response.data.authUrl;
    } catch (error) {
      console.error('Error connecting to Xero:', error);
      if (error.response?.status === 401 || error.response?.status === 403) {
        setMessage({
          type: 'error',
          text: 'Access denied. Only admin or developer users can connect to Xero.'
        });
      } else {
        setMessage({
          type: 'error',
          text: 'Failed to initiate Xero connection. Please try again.'
        });
      }
    }
  };

  const disconnectFromXero = async () => {
    if (!window.confirm('Are you sure you want to disconnect from Xero?')) {
      return;
    }

    try {
      await api.post('/xero/disconnect', { tenantId: selectedTenant });
      setMessage({ type: 'success', text: 'Disconnected from Xero successfully' });
      setConnected(false);
      setConnections([]);
      setSelectedTenant(null);
      setAccounts([]);
      setMappings({});
    } catch (error) {
      console.error('Error disconnecting from Xero:', error);
      setMessage({ type: 'error', text: 'Failed to disconnect from Xero' });
    }
  };

  const loadAccounts = useCallback(async () => {
    try {
      const response = await api.get(`/xero/accounts?tenantId=${selectedTenant}`);
      // Filter to expense accounts only
      const expenseAccounts = response.data.filter(
        acc => acc.type === 'EXPENSE' && acc.status === 'ACTIVE'
      );
      setAccounts(expenseAccounts);
    } catch (error) {
      console.error('Error loading accounts:', error);
      if (error.response?.status === 401) {
        setMessage({
          type: 'error',
          text: 'Authentication required. You need admin or developer privileges to access Xero settings.'
        });
      } else {
        setMessage({
          type: 'error',
          text: 'Failed to load Xero accounts. Try disconnecting and reconnecting to Xero.'
        });
      }
    }
  }, [selectedTenant]);

  const loadMappings = useCallback(async () => {
    try {
      const response = await api.get(`/xero/mappings?tenantId=${selectedTenant}`);
      const mappingsObj = {};
      response.data.forEach(m => {
        mappingsObj[m.category] = {
          code: m.xero_account_code,
          name: m.xero_account_name
        };
      });
      setMappings(mappingsObj);
    } catch (error) {
      console.error('Error loading mappings:', error);
    }
  }, [selectedTenant]);

  useEffect(() => {
    if (hasPermission) {
      checkStatus();
    }
  }, [hasPermission]);

  useEffect(() => {
    if (selectedTenant && hasPermission) {
      loadAccounts();
      loadMappings();
    }
  }, [selectedTenant, hasPermission, loadAccounts, loadMappings]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveMappings = async () => {
    setSaving(true);
    try {
      for (const [category, mapping] of Object.entries(mappings)) {
        if (mapping && mapping.code) {
          await api.post('/xero/mappings', {
            tenantId: selectedTenant,
            category,
            accountCode: mapping.code,
            accountName: mapping.name
          });
        }
      }
      setMessage({ type: 'success', text: 'Account mappings saved successfully!' });
    } catch (error) {
      console.error('Error saving mappings:', error);
      setMessage({ type: 'error', text: 'Failed to save account mappings' });
    } finally {
      setSaving(false);
    }
  };

  const loadExpenses = useCallback(async () => {
    setLoadingExpenses(true);
    try {
      const response = await api.get('/xero/expenses');
      setExpenses(response.data);
    } catch (error) {
      console.error('Error loading expenses:', error);
    } finally {
      setLoadingExpenses(false);
    }
  }, []);

  useEffect(() => {
    if (connected && selectedTenant && hasPermission) {
      loadExpenses();
    }
  }, [connected, selectedTenant, hasPermission, loadExpenses]);

  const handleSyncExpense = async (expenseId) => {
    setSyncingIds(prev => new Set(prev).add(expenseId));
    try {
      await api.post(`/xero/sync/${expenseId}`, { tenantId: selectedTenant });
      setMessage({ type: 'success', text: `Expense #${expenseId} synced to Xero successfully` });
      loadExpenses();
    } catch (error) {
      const errMsg = error.response?.data?.error || 'Failed to sync expense';
      setMessage({ type: 'error', text: errMsg });
    } finally {
      setSyncingIds(prev => {
        const next = new Set(prev);
        next.delete(expenseId);
        return next;
      });
    }
  };

  const handleBulkSync = async () => {
    const unsyncedIds = expenses
      .filter(e => !e.xero_invoice_id)
      .map(e => e.id);

    if (unsyncedIds.length === 0) {
      setMessage({ type: 'error', text: 'No unsynced expenses to send' });
      return;
    }

    setBulkSyncing(true);
    try {
      const result = await api.post('/xero/sync-bulk', {
        tenantId: selectedTenant,
        expenseIds: unsyncedIds
      });
      setMessage({ type: 'success', text: result.data.message });
      loadExpenses();
    } catch (error) {
      const errMsg = error.response?.data?.error || 'Bulk sync failed';
      setMessage({ type: 'error', text: errMsg });
    } finally {
      setBulkSyncing(false);
    }
  };

  const handleMappingChange = (category, accountCode) => {
    const account = accounts.find(a => a.code === accountCode);
    setMappings({
      ...mappings,
      [category]: account ? { code: account.code, name: account.name } : null
    });
  };

  if (loading) {
    return (
      <div className="page-container">
        <div className="page-header">
          <h2 className="page-title">Xero Settings</h2>
        </div>
        <div className="loading-container">
          <RefreshCw className="spinner" size={32} />
          <p>Loading Xero settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="page-header">
        <h2 className="page-title">Xero Accounting Integration</h2>
      </div>

      {message && (
        <div className={`alert alert-${message.type}`}>
          {message.type === 'success' ? <CheckCircle size={20} /> : <XCircle size={20} />}
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="alert-close">×</button>
        </div>
      )}

      {!hasPermission && !loading ? null : (
      <>
      <div className="card">
        <h3>Connection Status</h3>

        {!connected ? (
          <div className="xero-connection-status">
            <div className="status-badge status-disconnected">
              <XCircle size={16} />
              Not Connected
            </div>
            <p className="text-gray mt-2">
              Connect your Xero account to automatically sync approved expenses as bills.
            </p>
            <button
              onClick={connectToXero}
              className="btn btn-primary mt-4"
            >
              <ExternalLink size={16} />
              Connect to Xero
            </button>
          </div>
        ) : (
          <div className="xero-connection-status">
            <div className="status-badge status-connected">
              <CheckCircle size={16} />
              Connected
            </div>

            {connections.length > 0 && (
              <div className="mt-4">
                <label className="form-label">Xero Organization:</label>
                <select
                  className="form-input"
                  value={selectedTenant || ''}
                  onChange={(e) => setSelectedTenant(e.target.value)}
                >
                  {connections.map(conn => (
                    <option key={conn.tenant_id} value={conn.tenant_id}>
                      {conn.tenant_name}
                    </option>
                  ))}
                </select>
                <p className="text-sm text-gray mt-1">
                  Connected on {new Date(connections[0].created_at).toLocaleDateString()}
                </p>
              </div>
            )}

            <button
              onClick={disconnectFromXero}
              className="btn btn-danger mt-4"
            >
              Disconnect from Xero
            </button>
          </div>
        )}
      </div>

      {connected && selectedTenant && accounts.length > 0 && (
        <div className="card mt-4">
          <div className="card-header">
            <h3>Account Mapping</h3>
            <p className="text-gray">
              Map your expense categories to Xero chart of accounts
            </p>
          </div>

          <div className="account-mappings">
            {categories.map(category => (
              <div key={category.id} className="mapping-row">
                <label className="mapping-label">
                  {category.label}
                </label>
                <select
                  className="form-input"
                  value={mappings[category.id]?.code || ''}
                  onChange={(e) => handleMappingChange(category.id, e.target.value)}
                >
                  <option value="">Select Account...</option>
                  {accounts.map(account => (
                    <option key={account.accountId} value={account.code}>
                      {account.code} - {account.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div className="card-actions mt-4">
            <button
              onClick={saveMappings}
              className="btn btn-primary"
              disabled={saving}
            >
              {saving ? (
                <>
                  <RefreshCw className="spinner" size={16} />
                  Saving...
                </>
              ) : (
                <>
                  <Save size={16} />
                  Save Mappings
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {connected && selectedTenant && accounts.length === 0 && (
        <div className="card mt-4">
          <div className="alert alert-info">
            <RefreshCw className="spinner" size={20} />
            <span>Loading Xero chart of accounts...</span>
          </div>
        </div>
      )}

      {connected && selectedTenant && (
        <div className="card mt-4">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <h3 style={{ margin: 0 }}>Expense Sync Status</h3>
              <p className="text-gray" style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem' }}>
                Approved expenses and their Xero sync status
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {expenses.some(e => !e.xero_invoice_id) && (
                <button
                  onClick={handleBulkSync}
                  className="btn btn-primary"
                  disabled={bulkSyncing}
                >
                  {bulkSyncing ? (
                    <><RefreshCw className="spinner" size={16} /> Syncing...</>
                  ) : (
                    <><Upload size={16} /> Sync All Unsynced</>
                  )}
                </button>
              )}
              <button onClick={loadExpenses} className="btn btn-secondary" disabled={loadingExpenses}>
                <RefreshCw size={16} className={loadingExpenses ? 'spinner' : ''} />
                Refresh
              </button>
            </div>
          </div>

          {loadingExpenses ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <RefreshCw className="spinner" size={24} />
              <p className="text-gray">Loading expenses...</p>
            </div>
          ) : expenses.length === 0 ? (
            <p className="text-gray" style={{ textAlign: 'center', padding: '2rem' }}>
              No approved expenses found.
            </p>
          ) : (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Submitted By</th>
                    <th>Category</th>
                    <th>Amount</th>
                    <th>Xero Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map(expense => (
                    <tr key={expense.id}>
                      <td>{new Date(expense.date).toLocaleDateString()}</td>
                      <td>
                        <div>
                          <div>{expense.description}</div>
                          {expense.vendor_name && (
                            <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{expense.vendor_name}</div>
                          )}
                        </div>
                      </td>
                      <td>{expense.submitted_by}</td>
                      <td>{expense.category}</td>
                      <td>{formatCurrency(parseFloat(expense.amount))}</td>
                      <td>
                        {expense.xero_invoice_id ? (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                            background: '#f0fdf4', color: '#16a34a', padding: '0.25rem 0.5rem',
                            borderRadius: '0.25rem', fontSize: '0.75rem', fontWeight: '600'
                          }}>
                            <CheckCircle size={12} />
                            Synced
                          </span>
                        ) : expense.xero_sync_error ? (
                          <span
                            title={expense.xero_sync_error}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                              background: '#fef2f2', color: '#dc2626', padding: '0.25rem 0.5rem',
                              borderRadius: '0.25rem', fontSize: '0.75rem', fontWeight: '600',
                              cursor: 'help'
                            }}
                          >
                            <AlertTriangle size={12} />
                            Failed
                          </span>
                        ) : (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                            background: '#fef3c7', color: '#d97706', padding: '0.25rem 0.5rem',
                            borderRadius: '0.25rem', fontSize: '0.75rem', fontWeight: '600'
                          }}>
                            Not Synced
                          </span>
                        )}
                      </td>
                      <td>
                        {!expense.xero_invoice_id && (
                          <button
                            onClick={() => handleSyncExpense(expense.id)}
                            className="btn btn-secondary"
                            disabled={syncingIds.has(expense.id)}
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                          >
                            {syncingIds.has(expense.id) ? (
                              <><RefreshCw className="spinner" size={12} /> Syncing</>
                            ) : (
                              <><Upload size={12} /> Sync</>
                            )}
                          </button>
                        )}
                        {expense.xero_invoice_id && (
                          <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                            {expense.xero_invoice_id.substring(0, 8)}...
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="card mt-4">
        <h3>How It Works</h3>
        <ol className="steps-list">
          <li>Connect your Xero account using OAuth 2.0 (secure)</li>
          <li>Map your expense categories to Xero accounts</li>
          <li>When expenses are approved, sync them to Xero as bills</li>
          <li>Bills appear in Xero → Purchases → Awaiting Payment</li>
          <li>Process payments through Xero as usual</li>
        </ol>

        <div className="info-box mt-4">
          <h4>What gets synced?</h4>
          <ul>
            <li>✅ Vendor (auto-created as supplier if new)</li>
            <li>✅ Date and amount</li>
            <li>✅ Line items (from receipt OCR)</li>
            <li>✅ Account codes (based on your mappings)</li>
            <li>✅ Reference (Expense ID)</li>
          </ul>
        </div>
      </div>
      </>
      )}
    </div>
  );
};

export default XeroSettings;

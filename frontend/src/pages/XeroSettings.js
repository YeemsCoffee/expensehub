import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircle, XCircle, ExternalLink, RefreshCw, Save } from 'lucide-react';
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

  const categories = [
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
  ];

  const checkStatus = async () => {
    try {
      const response = await api.get('/xero/status');
      setConnected(response.data.connected);
      setConnections(response.data.connections || []);

      if (response.data.connections && response.data.connections.length > 0) {
        setSelectedTenant(response.data.connections[0].tenant_id);
      }
    } catch (error) {
      console.error('Error checking Xero status:', error);
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
      setMessage({ type: 'error', text: 'Failed to initiate Xero connection' });
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
      setMessage({ type: 'error', text: 'Failed to load Xero accounts' });
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
    checkStatus();
  }, []);

  useEffect(() => {
    if (selectedTenant) {
      loadAccounts();
      loadMappings();
    }
  }, [selectedTenant, loadAccounts, loadMappings]); // eslint-disable-line react-hooks/exhaustive-deps

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
    </div>
  );
};

export default XeroSettings;

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  CheckCircle, XCircle, ExternalLink, RefreshCw, Save, AlertTriangle, Upload,
  Trash2, ChevronDown, ChevronUp, Info
} from 'lucide-react';
import { formatCurrency } from '../utils/helpers';
import api from '../services/api';
import ConfirmModal from '../components/ConfirmModal';

// Mapping key for the optional account used by categories with no mapping
const DEFAULT_KEY = '__default__';
// Select value for a saved mapping whose account can no longer be chosen
const SAVED_SENTINEL = '__saved__';

const accountLabel = (code, name) => [code, name].filter(Boolean).join(' - ') || 'Unknown account';

// Query string of the hash route the OAuth callback redirects to
function readReturnParams() {
  const hash = window.location.hash || '';
  const i = hash.indexOf('?');
  return new URLSearchParams(i >= 0 ? hash.slice(i + 1) : '');
}

const MESSAGE_ICONS = { success: CheckCircle, info: Info, warning: AlertTriangle, error: XCircle };

const XeroSettings = () => {
  const [connected, setConnected] = useState(false);
  const [connections, setConnections] = useState([]);
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [needsDefault, setNeedsDefault] = useState(false);
  const [switchingOrg, setSwitchingOrg] = useState(false);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);

  // Full chart of accounts for the selected organisation, as Xero returns it
  const [allAccounts, setAllAccounts] = useState([]);
  const [accountsStatus, setAccountsStatus] = useState('idle'); // idle | loading | loaded | error
  const [accountsError, setAccountsError] = useState(null);
  const [showFullChart, setShowFullChart] = useState(false);

  // What each category is mapped to, and where its expenses actually post
  const [overview, setOverview] = useState(null);
  const [overviewStatus, setOverviewStatus] = useState('idle');
  // Unsaved changes: key -> accountId, or '' to remove the mapping
  const [edits, setEdits] = useState({});
  const [saving, setSaving] = useState(false);

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [hasPermission, setHasPermission] = useState(false);
  const [expenses, setExpenses] = useState([]);
  const [loadingExpenses, setLoadingExpenses] = useState(false);
  const [syncingIds, setSyncingIds] = useState(new Set());
  const [bulkSyncing, setBulkSyncing] = useState(false);

  // The organisation whose data is on screen. Responses for any other
  // organisation (a slow request from before a switch) are dropped.
  const tenantRef = useRef(null);

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

  // Result of the Xero OAuth redirect
  useEffect(() => {
    const params = readReturnParams();
    if (params.get('connected') === 'false') {
      const reason = params.get('error');
      setMessage({ type: 'error', text: `Could not connect to Xero${reason ? `: ${reason}` : '.'}` });
    } else if (params.get('connected') === 'true' && params.get('choose') === '1') {
      setMessage({
        type: 'info',
        text: 'Connected to Xero. Several organisations are available - choose the one ExpenseHub should sync to.'
      });
    } else if (params.get('connected') === 'true') {
      setMessage({ type: 'success', text: 'Connected to Xero.' });
    }
  }, []);

  const resetOrganisationData = useCallback(() => {
    setAllAccounts([]);
    setAccountsStatus('idle');
    setAccountsError(null);
    setOverview(null);
    setOverviewStatus('idle');
    setEdits({});
    setShowFullChart(false);
  }, []);

  // The backend answers Xero-connection problems with a `code` so they are
  // never confused with an ExpenseHub login problem. Returns true if handled.
  const handleXeroConnectionError = useCallback((error) => {
    const code = error.response?.data?.code;
    if (code === 'XERO_RECONNECT_REQUIRED' || code === 'XERO_NOT_CONNECTED') {
      tenantRef.current = null;
      setConnected(false);
      setConnections([]);
      setSelectedTenant(null);
      setNeedsDefault(false);
      resetOrganisationData();
      setExpenses([]);
      setMessage({
        type: 'error',
        text: code === 'XERO_RECONNECT_REQUIRED'
          ? 'Your Xero connection has expired and must be reconnected. Click "Connect to Xero" to sign in to Xero again - your account mappings are kept.'
          : 'Not connected to Xero. Click "Connect to Xero" to get started.'
      });
      return true;
    }
    if (code === 'XERO_CHOOSE_ORG') {
      tenantRef.current = null;
      setSelectedTenant(null);
      setNeedsDefault(true);
      resetOrganisationData();
      setMessage({ type: 'warning', text: error.response.data.error });
      return true;
    }
    if (code === 'XERO_REFRESH_FAILED') {
      setMessage({
        type: 'error',
        text: 'Could not reach Xero to refresh the connection. Please try again in a moment.'
      });
      return true;
    }
    return false;
  }, [resetOrganisationData]);

  const checkStatus = useCallback(async () => {
    try {
      const { data } = await api.get('/xero/status');
      setConnected(Boolean(data.connected));
      setConnections(data.connections || []);
      setNeedsDefault(Boolean(data.needsDefault));
      // Always the organisation expenses sync to - never "whichever row was
      // written last", which used to show another org's chart
      setSelectedTenant(data.defaultTenantId || null);
    } catch (error) {
      console.error('Error checking Xero status:', error);
      setMessage({
        type: 'error',
        text: error.response?.data?.error || 'Failed to check the Xero connection.'
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hasPermission) {
      checkStatus();
    }
  }, [hasPermission, checkStatus]);

  const loadAccounts = useCallback(async (tenantId) => {
    setAllAccounts([]);
    setAccountsError(null);
    setAccountsStatus('loading');
    try {
      const { data } = await api.get('/xero/accounts', { params: { tenantId } });
      if (tenantRef.current !== tenantId) return;
      setAllAccounts(Array.isArray(data) ? data : []);
      setAccountsStatus('loaded');
    } catch (error) {
      if (tenantRef.current !== tenantId) return;
      console.error('Error loading accounts:', error);
      if (handleXeroConnectionError(error)) return;
      setAccountsStatus('error');
      setAccountsError(error.response?.data?.error || 'Failed to load the chart of accounts from Xero.');
    }
  }, [handleXeroConnectionError]);

  const loadOverview = useCallback(async (tenantId) => {
    setOverviewStatus('loading');
    try {
      const { data } = await api.get('/xero/mappings', { params: { tenantId } });
      if (tenantRef.current !== tenantId) return;
      setOverview(data);
      setOverviewStatus('loaded');
    } catch (error) {
      if (tenantRef.current !== tenantId) return;
      console.error('Error loading mappings:', error);
      if (handleXeroConnectionError(error)) return;
      setOverviewStatus('error');
    }
  }, [handleXeroConnectionError]);

  // Load the selected organisation's chart and mappings; never show one
  // organisation's accounts under another's name
  useEffect(() => {
    tenantRef.current = selectedTenant;
    resetOrganisationData();
    if (hasPermission && selectedTenant) {
      loadAccounts(selectedTenant);
      loadOverview(selectedTenant);
    }
  }, [selectedTenant, hasPermission, loadAccounts, loadOverview, resetOrganisationData]);

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
    setShowDisconnectConfirm(false);
    try {
      await api.post('/xero/disconnect');
      tenantRef.current = null;
      setSelectedTenant(null);
      setConnections([]);
      setConnected(false);
      setNeedsDefault(false);
      resetOrganisationData();
      setExpenses([]);
      setMessage({ type: 'success', text: 'Disconnected from Xero. Your account mappings are kept for when you reconnect.' });
      await checkStatus();
    } catch (error) {
      console.error('Error disconnecting from Xero:', error);
      setMessage({ type: 'error', text: 'Failed to disconnect from Xero' });
    }
  };

  // The organisation selector sets the organisation expenses sync to, so the
  // page always shows the chart and mappings that syncing will use.
  const chooseOrganisation = async (tenantId) => {
    if (!tenantId || tenantId === selectedTenant) return;
    if (Object.keys(edits).length > 0 &&
        !window.confirm('You have unsaved mapping changes. Switch organisation and discard them?')) {
      return;
    }
    setSwitchingOrg(true);
    try {
      await api.post('/xero/default', { tenantId });
      const name = connections.find(c => c.tenant_id === tenantId)?.tenant_name;
      setConnections(prev => prev.map(c => ({ ...c, is_default: c.tenant_id === tenantId })));
      setNeedsDefault(false);
      setSelectedTenant(tenantId);
      setMessage({ type: 'success', text: `Approved expenses will now sync to ${name || 'the selected organisation'}.` });
    } catch (error) {
      if (handleXeroConnectionError(error)) return;
      setMessage({ type: 'error', text: error.response?.data?.error || 'Failed to change the Xero organisation' });
    } finally {
      setSwitchingOrg(false);
    }
  };

  const handleSyncExpense = async (expenseId) => {
    setSyncingIds(prev => new Set(prev).add(expenseId));
    try {
      const { data } = await api.post(`/xero/sync/${expenseId}`, { tenantId: selectedTenant });
      setMessage({ type: 'success', text: `Expense #${expenseId}: ${data.message}` });
    } catch (error) {
      if (handleXeroConnectionError(error)) return;
      setMessage({ type: 'error', text: error.response?.data?.error || 'Failed to sync expense' });
    } finally {
      setSyncingIds(prev => {
        const next = new Set(prev);
        next.delete(expenseId);
        return next;
      });
      loadExpenses();
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
      setMessage({ type: result.data.failed ? 'warning' : 'success', text: result.data.message });
    } catch (error) {
      if (handleXeroConnectionError(error)) return;
      const errMsg = error.response?.data?.error || 'Bulk sync failed';
      setMessage({ type: 'error', text: errMsg });
    } finally {
      setBulkSyncing(false);
      loadExpenses();
    }
  };

  // ---------------------------------------------------------------------------
  // Account mapping
  // ---------------------------------------------------------------------------
  const selectedConnection = connections.find(c => c.tenant_id === selectedTenant) || null;
  const orgName = selectedConnection ? selectedConnection.tenant_name : 'this organisation';

  const selectable = useMemo(() => allAccounts.filter(a => a.selectable), [allAccounts]);
  const expenseOptions = useMemo(() => selectable.filter(a => a.group === 'expense'), [selectable]);
  const assetOptions = useMemo(() => selectable.filter(a => a.group === 'asset'), [selectable]);
  const accountById = useMemo(() => new Map(allAccounts.map(a => [a.accountId, a])), [allAccounts]);
  const hiddenCount = allAccounts.length - selectable.length;

  const categoryRows = overview ? overview.rows.filter(r => r.kind === 'category') : [];
  const expenseOnlyRows = overview ? overview.rows.filter(r => r.kind === 'expense_only') : [];
  const orphans = overview ? overview.orphans : [];
  const pendingCount = Object.keys(edits).length;

  // Select value representing what is saved for a mapping
  const savedValueFor = useCallback((mapping) => {
    if (!mapping) return '';
    const live = mapping.accountId
      ? accountById.get(mapping.accountId)
      : selectable.find(a => a.code === mapping.code);
    return live && live.selectable ? live.accountId : SAVED_SENTINEL;
  }, [accountById, selectable]);

  const valueFor = (key, mapping) =>
    Object.prototype.hasOwnProperty.call(edits, key) ? edits[key] : savedValueFor(mapping);

  const handleSelect = (key, mapping, value) => {
    setEdits(prev => {
      const next = { ...prev };
      if (value === savedValueFor(mapping)) {
        delete next[key];
      } else {
        next[key] = value;
      }
      return next;
    });
  };

  const toggleRemoveOrphan = (key) => {
    setEdits(prev => {
      const next = { ...prev };
      if (next[key] === '') {
        delete next[key];
      } else {
        next[key] = '';
      }
      return next;
    });
  };

  const labelForKey = (key) => {
    if (key === DEFAULT_KEY) return 'Default account';
    const row = overview?.rows.find(r => r.key === key);
    return row ? row.name : key;
  };

  const saveMappings = async () => {
    const entries = Object.entries(edits);
    if (entries.length === 0 || !selectedTenant) return;

    const tenantId = selectedTenant;
    const failures = [];
    const failedKeys = new Set();
    let saved = 0;

    setSaving(true);
    try {
      for (const [key, value] of entries) {
        try {
          if (value === '') {
            await api.delete('/xero/mappings', { params: { tenantId, category: key } });
          } else {
            const account = accountById.get(value);
            if (!account) continue;
            await api.post('/xero/mappings', {
              tenantId,
              category: key,
              accountId: account.accountId,
              accountCode: account.code
            });
          }
          saved += 1;
        } catch (error) {
          if (handleXeroConnectionError(error)) return;
          failedKeys.add(key);
          failures.push(`${labelForKey(key)}: ${error.response?.data?.error || 'could not be saved'}`);
        }
      }

      if (tenantRef.current !== tenantId) return;
      // Keep only the edits that failed, so they can be corrected and retried
      setEdits(prev => Object.fromEntries(Object.entries(prev).filter(([k]) => failedKeys.has(k))));
      await loadOverview(tenantId);

      if (failures.length === 0) {
        setMessage({ type: 'success', text: `Saved ${saved} mapping change${saved === 1 ? '' : 's'}.` });
      } else {
        setMessage({
          type: 'error',
          text: `${saved} change${saved === 1 ? '' : 's'} saved, ${failures.length} failed - ${failures.join('; ')}`
        });
      }
    } finally {
      setSaving(false);
    }
  };

  const renderAccountSelect = (key, mapping, label) => {
    const savedValue = savedValueFor(mapping);
    return (
      <select
        className="form-input"
        value={valueFor(key, mapping)}
        onChange={(e) => handleSelect(key, mapping, e.target.value)}
        disabled={saving}
        aria-label={`Xero account for ${label}`}
      >
        <option value="">{mapping ? 'No account (remove mapping)' : 'Select account...'}</option>
        {savedValue === SAVED_SENTINEL && (
          <option value={SAVED_SENTINEL}>
            {accountLabel(mapping.code, mapping.name)} - {mapping.problemText || 'not available in Xero'}
          </option>
        )}
        {expenseOptions.length > 0 && (
          <optgroup label="Expense accounts">
            {expenseOptions.map(a => (
              <option key={a.accountId} value={a.accountId}>
                {accountLabel(a.code, a.name)}{a.type !== 'EXPENSE' ? ` (${a.typeLabel})` : ''}
              </option>
            ))}
          </optgroup>
        )}
        {assetOptions.length > 0 && (
          <optgroup label="Asset accounts (capitalise or prepay)">
            {assetOptions.map(a => (
              <option key={a.accountId} value={a.accountId}>
                {accountLabel(a.code, a.name)} ({a.typeLabel})
              </option>
            ))}
          </optgroup>
        )}
      </select>
    );
  };

  // What actually happens to expenses in this row today
  const renderRowNote = (key, row, isDefaultRow) => {
    if (Object.prototype.hasOwnProperty.call(edits, key)) {
      return <p className="mapping-note mapping-note--pending">Unsaved change</p>;
    }
    const { mapping, effective } = row;

    if (mapping) {
      if (mapping.problem) {
        return (
          <p className="mapping-note mapping-note--warn">
            <AlertTriangle size={12} />
            <span>
              {accountLabel(mapping.code, mapping.name)} {mapping.problemText}. Expenses here will fail to sync until you choose another account.
            </span>
          </p>
        );
      }
      return null;
    }

    if (isDefaultRow) {
      return (
        <p className="mapping-note">
          Optional. Used for any category without its own mapping. If left empty, expenses in an unmapped category are not sent to Xero until you map it.
        </p>
      );
    }

    if (effective) {
      const via = effective.source === 'default'
        ? 'the default account'
        : 'a fallback code set on the Expense Categories page';
      if (effective.problem) {
        return (
          <p className="mapping-note mapping-note--warn">
            <AlertTriangle size={12} />
            <span>
              Uses {via}: {accountLabel(effective.code, effective.name)}, which {effective.problemText}. Expenses here will fail to sync.
            </span>
          </p>
        );
      }
      return (
        <p className="mapping-note">
          Currently posts to {accountLabel(effective.code, effective.name)} ({via}).
        </p>
      );
    }

    return (
      <p className="mapping-note mapping-note--warn">
        <AlertTriangle size={12} />
        <span>Not mapped - expenses in this category are not sent to Xero until you choose an account (or set a default account).</span>
      </p>
    );
  };

  const renderMappingRow = (row) => (
    <div key={row.key} className="mapping-row mapping-row--top">
      <label className="mapping-label">
        {row.name}
        {row.kind === 'expense_only' && (
          <span className="mapping-label-meta">
            {row.expenseCount} approved expense{row.expenseCount === 1 ? '' : 's'}
          </span>
        )}
      </label>
      <div className="mapping-control">
        {renderAccountSelect(row.key, row.mapping, row.name)}
        {renderRowNote(row.key, row, false)}
      </div>
    </div>
  );

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

  const MessageIcon = message ? (MESSAGE_ICONS[message.type] || XCircle) : null;

  return (
    <div className="container">
      <div className="page-header">
        <h2 className="page-title">Xero Accounting Integration</h2>
      </div>

      {message && (
        <div className={`alert alert-${message.type}`}>
          <MessageIcon size={20} />
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="alert-close" aria-label="Dismiss">×</button>
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
                <label className="form-label" htmlFor="xero-organisation">
                  Xero organisation expenses sync to
                </label>
                <select
                  id="xero-organisation"
                  className="form-input"
                  value={selectedTenant || ''}
                  onChange={(e) => chooseOrganisation(e.target.value)}
                  disabled={switchingOrg}
                >
                  {!selectedTenant && <option value="">Choose an organisation...</option>}
                  {connections.map(conn => (
                    <option key={conn.tenant_id} value={conn.tenant_id}>
                      {conn.tenant_name}{conn.is_demo_company ? ' (Xero Demo Company)' : ''}
                    </option>
                  ))}
                </select>
                <p className="xero-org-note">
                  Approved expenses are posted as bills to this organisation, and the account
                  mapping below uses its chart of accounts.
                  {selectedConnection && ` Connected on ${new Date(selectedConnection.created_at).toLocaleDateString()}.`}
                </p>
                {selectedConnection?.is_demo_company && (
                  <div className="alert alert-warning mt-2">
                    <AlertTriangle size={18} />
                    <span>
                      This is Xero's Demo Company, not a real organisation. Its chart of accounts will not
                      match your own. Choose your organisation above, or connect it with "Connect another organisation".
                    </span>
                  </div>
                )}
              </div>
            )}

            {needsDefault && (
              <div className="alert alert-warning mt-2">
                <AlertTriangle size={18} />
                <span>
                  Several Xero organisations are connected. Choose the one ExpenseHub should sync to -
                  until you do, approved expenses are not sent to Xero.
                </span>
              </div>
            )}

            <div className="flex gap-8 mt-4" style={{ flexWrap: 'wrap' }}>
              <button onClick={connectToXero} className="btn btn-secondary">
                <ExternalLink size={16} />
                Connect another organisation
              </button>
              <button
                onClick={() => setShowDisconnectConfirm(true)}
                className="btn btn-danger"
              >
                Disconnect from Xero
              </button>
            </div>
          </div>
        )}
      </div>

      {connected && selectedTenant && (
        <div className="card mt-4">
          <div className="card-header">
            <h3>Account Mapping - {orgName}</h3>
            <p className="text-gray">
              Choose the Xero account each expense category posts to. These are the accounts
              approved expenses are coded to when they are sent to {orgName}.
            </p>
          </div>

          {(accountsStatus === 'loading' || overviewStatus === 'loading') && (
            <div className="alert alert-info">
              <RefreshCw className="spinner" size={20} />
              <span>Loading the chart of accounts from {orgName}...</span>
            </div>
          )}

          {accountsStatus === 'error' && (
            <div className="alert alert-error">
              <XCircle size={20} />
              <div>
                <p>{accountsError}</p>
                <button className="btn btn-secondary btn-sm mt-2" onClick={() => loadAccounts(selectedTenant)}>
                  <RefreshCw size={14} /> Retry
                </button>
              </div>
            </div>
          )}

          {overviewStatus === 'error' && (
            <div className="alert alert-error">
              <XCircle size={20} />
              <div>
                <p>Failed to load the account mappings.</p>
                <button className="btn btn-secondary btn-sm mt-2" onClick={() => loadOverview(selectedTenant)}>
                  <RefreshCw size={14} /> Retry
                </button>
              </div>
            </div>
          )}

          {accountsStatus === 'loaded' && overviewStatus === 'loaded' && overview && (
            <>
              <div className="xero-chart-summary">
                <p>
                  Showing <strong>{selectable.length}</strong> of the <strong>{allAccounts.length}</strong> accounts
                  in {orgName}'s chart: expense accounts (including Direct Costs, Overhead and Depreciation) and
                  asset accounts expenses can be capitalised to.
                  {hiddenCount > 0 && ` ${hiddenCount} ${hiddenCount === 1 ? 'is' : 'are'} hidden because expenses can't be posted to ${hiddenCount === 1 ? 'it' : 'them'} (bank, revenue, liability, equity, archived or system accounts).`}
                </p>
                <button
                  type="button"
                  className="btn btn-link"
                  onClick={() => setShowFullChart(v => !v)}
                  aria-expanded={showFullChart}
                >
                  {showFullChart ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  {showFullChart ? 'Hide' : 'View'} full chart of accounts ({allAccounts.length})
                </button>

                {showFullChart && (
                  <div className="table-wrapper xero-chart-table">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Code</th>
                          <th>Name</th>
                          <th>Type</th>
                          <th>Status</th>
                          <th>Usable for expenses</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allAccounts.map(a => (
                          <tr key={a.accountId}>
                            <td className="font-mono">{a.code || '-'}</td>
                            <td>{a.name}</td>
                            <td>{a.typeLabel}</td>
                            <td>{a.status === 'ACTIVE' ? 'Active' : 'Archived'}</td>
                            <td>{a.selectable ? 'Yes' : <span className="text-gray">No - {a.hiddenReason}</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {!overview.chartVerified && (
                <div className="alert alert-warning">
                  <AlertTriangle size={18} />
                  <span>Xero could not be reached to check these mappings against the live chart of accounts.</span>
                </div>
              )}

              {selectable.length === 0 && (
                <div className="alert alert-warning">
                  <AlertTriangle size={18} />
                  <span>
                    {orgName}'s chart has no active expense or asset accounts with a code, so no category can be
                    mapped. Check the chart of accounts in Xero.
                  </span>
                </div>
              )}

              <div className="account-mappings">
                <div className="mapping-row mapping-row--top mapping-row--default">
                  <label className="mapping-label">
                    Default account
                    <span className="mapping-label-meta">for categories without a mapping</span>
                  </label>
                  <div className="mapping-control">
                    {renderAccountSelect(DEFAULT_KEY, overview.defaultMapping, 'categories without a mapping')}
                    {renderRowNote(DEFAULT_KEY, { mapping: overview.defaultMapping, effective: null }, true)}
                  </div>
                </div>

                {categoryRows.map(renderMappingRow)}
              </div>

              {expenseOnlyRows.length > 0 && (
                <>
                  <h4 className="mapping-section-title">Other categories on approved expenses</h4>
                  <p className="mapping-section-hint">
                    These categories are used on approved expenses but are not in your category list
                    (for example project budget categories). Map them here so those expenses sync too.
                  </p>
                  <div className="account-mappings">
                    {expenseOnlyRows.map(renderMappingRow)}
                  </div>
                </>
              )}

              {orphans.length > 0 && (
                <>
                  <h4 className="mapping-section-title">Saved mappings for categories that no longer exist</h4>
                  <p className="mapping-section-hint">
                    These were saved under category names that are no longer used. They can still apply to
                    older expenses that carry the old name. Remove any you don't need.
                  </p>
                  <div className="account-mappings">
                    {orphans.map(o => {
                      const removing = edits[o.key] === '';
                      return (
                        <div
                          key={o.key}
                          className={`mapping-row mapping-row--top${removing ? ' mapping-row--removing' : ''}`}
                        >
                          <span className="mapping-label font-mono">{o.key}</span>
                          <div className="mapping-control mapping-control--inline">
                            <span className="mapping-orphan-account">
                              {accountLabel(o.code, o.name)}
                              {o.problemText ? ` - ${o.problemText}` : ''}
                              {removing ? ' (will be removed)' : ''}
                            </span>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => toggleRemoveOrphan(o.key)}
                              disabled={saving}
                            >
                              {removing ? 'Undo' : <><Trash2 size={14} /> Remove</>}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              <div className="card-actions mt-4">
                <button
                  onClick={saveMappings}
                  className="btn btn-primary"
                  disabled={saving || pendingCount === 0}
                >
                  {saving ? (
                    <>
                      <RefreshCw className="spinner" size={16} />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save size={16} />
                      {pendingCount > 0
                        ? `Save ${pendingCount} change${pendingCount === 1 ? '' : 's'}`
                        : 'No changes to save'}
                    </>
                  )}
                </button>
              </div>
            </>
          )}
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
                          <>
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
                            <div className="xero-sync-error">{expense.xero_sync_error}</div>
                          </>
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
          <li>Choose the Xero organisation expenses sync to</li>
          <li>Map your expense categories to accounts from that organisation's chart</li>
          <li>When expenses are approved, they are sent to Xero as bills</li>
          <li>Bills appear in Xero → Purchases → Awaiting Payment</li>
          <li>Process payments through Xero as usual</li>
        </ol>

        <div className="info-box mt-4">
          <h4>What gets synced?</h4>
          <ul>
            <li>✅ Vendor (auto-created as supplier if new)</li>
            <li>✅ Date and amount</li>
            <li>✅ Line items (from receipt OCR)</li>
            <li>✅ Account codes (from your mappings - an unmapped category is not posted)</li>
            <li>✅ Reference (Expense ID)</li>
          </ul>
        </div>
      </div>
      </>
      )}

      <ConfirmModal
        open={showDisconnectConfirm}
        variant="danger"
        title="Disconnect from Xero?"
        description="This disconnects ExpenseHub from every connected Xero organisation and stops expenses syncing. Your account mappings are kept, so reconnecting restores them."
        confirmLabel="Disconnect"
        cancelLabel="Stay connected"
        onConfirm={disconnectFromXero}
        onCancel={() => setShowDisconnectConfirm(false)}
      />
    </div>
  );
};

export default XeroSettings;

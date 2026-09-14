import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus, Edit2, Trash2, Save, X, CheckCircle, XCircle,
  AlertTriangle, Info, Building, User, Shield, ChevronRight, Eye
} from 'lucide-react';
import api from '../services/api';
import { useToast } from '../components/Toast';

const emptyForm = {
  name: '',
  description: '',
  minAmount: '',
  maxAmount: '',
  unlimitedMax: false,
  levelsRequired: '1',
  costCenterId: '',
  isActive: true
};

const formatCurrency = (amount) => {
  const value = Number(amount);
  if (amount === null || amount === undefined || amount === '' || Number.isNaN(value)) {
    return '-';
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(value);
};

const formatRange = (minAmount, maxAmount) => {
  const min = formatCurrency(minAmount);
  if (maxAmount === null || maxAmount === undefined || maxAmount === '') {
    return `${min} and above (unlimited)`;
  }
  return `${min} - ${formatCurrency(maxAmount)}`;
};

/**
 * Work out which amounts (>= 0) are not covered by any ACTIVE org-wide rule
 * (cost_center_id === null). Org-wide rules are the fallback for every cost
 * center, so a hole here means those expenses match no rule at all.
 * Bounds are inclusive on both ends, so min === previous max is contiguous.
 */
const computeCoverageGaps = (rules) => {
  const orgWide = rules
    .filter((rule) => rule.is_active && (rule.cost_center_id === null || rule.cost_center_id === undefined))
    .map((rule) => ({
      min: Number(rule.min_amount) || 0,
      max: rule.max_amount === null || rule.max_amount === undefined ? null : Number(rule.max_amount)
    }))
    .sort((a, b) => a.min - b.min);

  if (orgWide.length === 0) {
    return [{ kind: 'all' }];
  }

  const gaps = [];
  let coveredTo = null; // highest amount covered so far (inclusive)
  let unlimited = false;

  for (const rule of orgWide) {
    if (coveredTo === null) {
      if (rule.min > 0) {
        gaps.push({ kind: 'below', to: rule.min });
      }
    } else if (rule.min > coveredTo) {
      gaps.push({ kind: 'between', from: coveredTo, to: rule.min });
    }

    if (rule.max === null) {
      unlimited = true;
      break;
    }
    coveredTo = coveredTo === null ? rule.max : Math.max(coveredTo, rule.max);
  }

  if (!unlimited && coveredTo !== null) {
    gaps.push({ kind: 'above', from: coveredTo });
  }

  return gaps;
};

const describeGap = (gap) => {
  switch (gap.kind) {
    case 'all':
      return 'Any amount (there are no active org-wide rules)';
    case 'below':
      return `Under ${formatCurrency(gap.to)}`;
    case 'between':
      return `Over ${formatCurrency(gap.from)} and under ${formatCurrency(gap.to)}`;
    case 'above':
      return `Over ${formatCurrency(gap.from)}`;
    default:
      return '';
  }
};

const ApprovalRules = () => {
  const toast = useToast();

  const [rules, setRules] = useState([]);
  const [costCenters, setCostCenters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasPermission, setHasPermission] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [formData, setFormData] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [previewData, setPreviewData] = useState({ amount: '', costCenterId: '' });
  const [previewResult, setPreviewResult] = useState(null);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    let user = null;
    try {
      const userStr = localStorage.getItem('user');
      user = userStr ? JSON.parse(userStr) : null;
    } catch (err) {
      console.warn('Could not parse stored user:', err.message);
    }
    const role = user?.role || localStorage.getItem('role') || 'employee';

    if (role === 'admin' || role === 'developer') {
      setHasPermission(true);
      loadData();
    } else {
      setHasPermission(false);
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = async () => {
    try {
      const [rulesResponse, costCentersResponse] = await Promise.all([
        api.get('/approval-rules'),
        api.get('/cost-centers').catch((err) => {
          console.warn('Failed to load cost centers:', err.message);
          return { data: [] };
        })
      ]);
      setRules(rulesResponse.data || []);
      setCostCenters(costCentersResponse.data || []);
    } catch (err) {
      console.error('Error fetching approval rules:', err);
      toast.error(err.response?.data?.error || 'Failed to load approval rules');
    } finally {
      setLoading(false);
    }
  };

  const fetchRules = async () => {
    try {
      const response = await api.get('/approval-rules');
      setRules(response.data || []);
    } catch (err) {
      console.error('Error fetching approval rules:', err);
      toast.error(err.response?.data?.error || 'Failed to load approval rules');
    }
  };

  const coverageGaps = useMemo(() => computeCoverageGaps(rules), [rules]);

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const openCreateForm = () => {
    setEditingRule(null);
    setFormData(emptyForm);
    setFormError('');
    setShowForm(true);
  };

  const openEditForm = (rule) => {
    setEditingRule(rule);
    setFormData({
      name: rule.name || '',
      description: rule.description || '',
      minAmount: rule.min_amount === null || rule.min_amount === undefined ? '' : String(Number(rule.min_amount)),
      maxAmount: rule.max_amount === null || rule.max_amount === undefined ? '' : String(Number(rule.max_amount)),
      unlimitedMax: rule.max_amount === null || rule.max_amount === undefined,
      levelsRequired: String(rule.levels_required || 1),
      costCenterId: rule.cost_center_id === null || rule.cost_center_id === undefined ? '' : String(rule.cost_center_id),
      isActive: rule.is_active !== false
    });
    setFormError('');
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingRule(null);
    setFormData(emptyForm);
    setFormError('');
  };

  const validateForm = () => {
    if (!formData.name.trim()) {
      return 'Rule name is required';
    }

    const min = Number(formData.minAmount);
    if (formData.minAmount === '' || Number.isNaN(min) || min < 0) {
      return 'Minimum amount must be 0 or greater';
    }

    if (!formData.unlimitedMax) {
      const max = Number(formData.maxAmount);
      if (formData.maxAmount === '' || Number.isNaN(max)) {
        return 'Enter a maximum amount, or tick "No upper limit"';
      }
      if (max <= min) {
        return 'Maximum amount must be greater than minimum amount';
      }
    }

    const levels = Number(formData.levelsRequired);
    if (!Number.isInteger(levels) || levels < 1 || levels > 10) {
      return 'Approval levels must be a whole number between 1 and 10';
    }

    return '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const validationError = validateForm();
    if (validationError) {
      setFormError(validationError);
      toast.error(validationError);
      return;
    }

    const payload = {
      name: formData.name.trim(),
      description: formData.description.trim(),
      minAmount: Number(formData.minAmount),
      maxAmount: formData.unlimitedMax ? null : Number(formData.maxAmount),
      levelsRequired: Number(formData.levelsRequired),
      costCenterId: formData.costCenterId === '' ? null : Number(formData.costCenterId),
      isActive: formData.isActive
    };

    setSaving(true);
    setFormError('');
    try {
      if (editingRule) {
        await api.put(`/approval-rules/${editingRule.id}`, payload);
        toast.success('Approval rule updated successfully');
      } else {
        await api.post('/approval-rules', payload);
        toast.success('Approval rule created successfully');
      }
      closeForm();
      fetchRules();
    } catch (err) {
      const message = err.response?.data?.error
        || err.response?.data?.errors?.[0]?.msg
        || 'Failed to save approval rule';
      setFormError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (rule) => {
    try {
      await api.put(`/approval-rules/${rule.id}`, { isActive: !rule.is_active });
      toast.success(`Rule "${rule.name}" ${rule.is_active ? 'deactivated' : 'activated'}`);
      fetchRules();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update approval rule');
    }
  };

  const handleDelete = async (rule) => {
    const confirmed = window.confirm(
      `Delete approval rule "${rule.name}"? This cannot be undone.\n\n` +
      'If expenses already use this rule, deactivate it instead.'
    );
    if (!confirmed) return;

    try {
      await api.delete(`/approval-rules/${rule.id}`);
      toast.success('Approval rule deleted');
      fetchRules();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete approval rule');
    }
  };

  const handlePreview = async (e) => {
    e.preventDefault();

    const amount = Number(previewData.amount);
    if (previewData.amount === '' || Number.isNaN(amount) || amount < 0) {
      toast.error('Enter an amount of 0 or more to preview');
      return;
    }

    setPreviewing(true);
    try {
      const response = await api.post('/approval-rules/preview-chain', {
        amount,
        costCenterId: previewData.costCenterId === '' ? null : Number(previewData.costCenterId)
      });
      setPreviewResult({ ...response.data, amount });
    } catch (err) {
      setPreviewResult(null);
      toast.error(err.response?.data?.error || 'Failed to preview approval chain');
    } finally {
      setPreviewing(false);
    }
  };

  // The API updates with COALESCE, so a null sent on edit keeps the stored
  // value. Warn when an edit is trying to clear a bound back to "no limit".
  const clearingUpperLimit = Boolean(
    editingRule && formData.unlimitedMax && editingRule.max_amount !== null && editingRule.max_amount !== undefined
  );
  const clearingCostCenter = Boolean(
    editingRule && formData.costCenterId === '' && editingRule.cost_center_id !== null && editingRule.cost_center_id !== undefined
  );

  if (!hasPermission) {
    return (
      <div className="container">
        <div className="empty-state">
          <Shield size={48} className="empty-state-icon" />
          <p className="empty-state-text">Access Denied</p>
          <p className="empty-state-subtext">
            Only admin or developer users can manage approval rules.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="page-title">Loading approval rules...</div>;
  }

  const activeCount = rules.filter((rule) => rule.is_active).length;

  return (
    <div className="container">
      <div className="page-header">
        <div>
          <h2 className="page-title">Approval Rules</h2>
          <p className="text-gray-600">
            Match an expense amount to the number of approval levels required up the org chart.
            {' '}{activeCount} active of {rules.length} total.
          </p>
        </div>
        <button onClick={openCreateForm} className="btn btn-primary">
          <Plus size={20} />
          Add Rule
        </button>
      </div>

      {/* Coverage warning */}
      {coverageGaps.length > 0 ? (
        <div className="alert alert-warning mb-4">
          <AlertTriangle size={20} style={{ flexShrink: 0 }} />
          <div>
            <strong>Some amounts are not covered by any approval rule</strong>
            <p className="mt-1">
              Expenses in these ranges match no active org-wide rule, so they are
              auto-approved with no approver. Add org-wide rules (scope
              &quot;All cost centers&quot;) to close the gaps.
            </p>
            <ul style={{ margin: '0.5rem 0 0 1.25rem', listStyle: 'disc' }}>
              {coverageGaps.map((gap, index) => (
                <li key={index}>{describeGap(gap)}</li>
              ))}
            </ul>
            <p className="mt-2 text-sm">
              Cost-center-specific rules take priority over org-wide rules, but they only
              cover their own cost center - org-wide rules are the fallback for everything else.
            </p>
          </div>
        </div>
      ) : (
        <div className="alert alert-success mb-4">
          <CheckCircle size={20} style={{ flexShrink: 0 }} />
          <div>
            <strong>Every amount is covered</strong>
            <p className="mt-1">
              Active org-wide rules cover all amounts from {formatCurrency(0)} upward, so no
              expense can slip through without an approver.
            </p>
          </div>
        </div>
      )}

      {/* Rules list */}
      <div className="card mb-6">
        <h3 className="card-title">All Approval Rules ({rules.length})</h3>

        {rules.length === 0 ? (
          <div className="empty-state">
            <Shield size={48} className="empty-state-icon" />
            <p className="empty-state-text">No approval rules yet</p>
            <p className="empty-state-subtext">
              Without any rules, every expense is auto-approved with no approver.
            </p>
            <button onClick={openCreateForm} className="btn btn-primary mt-4">
              <Plus size={20} />
              Add Rule
            </button>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Rule</th>
                  <th>Amount Range</th>
                  <th>Levels Required</th>
                  <th>Cost Center Scope</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id} style={{ opacity: rule.is_active ? 1 : 0.6 }}>
                    <td>
                      <div className="font-medium">{rule.name}</div>
                      {rule.description && (
                        <div className="text-sm text-gray-500">{rule.description}</div>
                      )}
                    </td>
                    <td>{formatRange(rule.min_amount, rule.max_amount)}</td>
                    <td>
                      {rule.levels_required} {Number(rule.levels_required) === 1 ? 'level' : 'levels'}
                    </td>
                    <td>
                      {rule.cost_center_id ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                          <Building size={14} className="detail-icon" />
                          {rule.cost_center_code ? `${rule.cost_center_code} - ` : ''}
                          {rule.cost_center_name || `Cost center ${rule.cost_center_id}`}
                        </span>
                      ) : (
                        <span className="text-gray-500">All cost centers</span>
                      )}
                    </td>
                    <td>
                      {rule.is_active ? (
                        <span className="badge badge-success">Active</span>
                      ) : (
                        <span className="badge badge-secondary">Inactive</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => openEditForm(rule)}
                          className="btn-icon"
                          title="Edit rule"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleToggleActive(rule)}
                          className="btn-icon"
                          title={rule.is_active ? 'Deactivate rule' : 'Activate rule'}
                        >
                          {rule.is_active ? <XCircle size={16} /> : <CheckCircle size={16} />}
                        </button>
                        <button
                          onClick={() => handleDelete(rule)}
                          className="btn-icon btn-icon-danger"
                          title="Delete rule"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Preview widget */}
      <div className="card">
        <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Eye size={18} />
          Preview Approval Chain
        </h3>
        <p className="text-gray-600 mb-4">
          Check which rule an amount matches and who would approve it. The chain is built
          from your own manager hierarchy in the org chart.
        </p>

        <form onSubmit={handlePreview}>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Amount</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={previewData.amount}
                onChange={(e) => setPreviewData({ ...previewData, amount: e.target.value })}
                placeholder="1500.00"
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Cost Center</label>
              <select
                value={previewData.costCenterId}
                onChange={(e) => setPreviewData({ ...previewData, costCenterId: e.target.value })}
                className="form-select"
              >
                <option value="">No cost center</option>
                {costCenters.map((cc) => (
                  <option key={cc.id} value={cc.id}>
                    {cc.code} - {cc.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={previewing}>
              {previewing ? 'Checking...' : 'Preview Chain'}
            </button>
            {previewResult && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setPreviewResult(null)}
              >
                Clear
              </button>
            )}
          </div>
        </form>

        {previewResult && (
          <div className="mt-4">
            {previewResult.requiresApproval ? (
              <div>
                <div className="alert alert-info">
                  <Info size={20} style={{ flexShrink: 0 }} />
                  <div>
                    <strong>
                      {formatCurrency(previewResult.amount)} matches rule &quot;{previewResult.rule?.name}&quot;
                    </strong>
                    <p className="mt-1">
                      {formatRange(previewResult.rule?.min_amount, previewResult.rule?.max_amount)}
                      {' · '}
                      {previewResult.rule?.levels_required}
                      {Number(previewResult.rule?.levels_required) === 1 ? ' level' : ' levels'} of approval
                      {' · '}
                      {previewResult.rule?.cost_center_id ? 'Cost-center-specific rule' : 'Org-wide rule'}
                    </p>
                  </div>
                </div>

                <h4 className="card-subtitle mt-4">
                  Approvers ({previewResult.approvalChain?.length || 0})
                </h4>
                <div className="table-wrapper">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Level</th>
                        <th>Approver</th>
                        <th>Email</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(previewResult.approvalChain || []).map((step) => (
                        <tr key={`${step.level}-${step.manager_id}`}>
                          <td>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                              <ChevronRight size={14} className="detail-icon" />
                              Level {step.level}
                            </span>
                          </td>
                          <td>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                              <User size={14} className="detail-icon" />
                              {step.manager_name}
                            </span>
                          </td>
                          <td className="text-gray-600">{step.manager_email}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="alert alert-warning">
                <AlertTriangle size={20} style={{ flexShrink: 0 }} />
                <div>
                  <strong>
                    No approval required for {formatCurrency(previewResult.amount)}
                  </strong>
                  <p className="mt-1">
                    {previewResult.message || 'No matching approval rule.'}
                    {previewResult.error ? ` (${previewResult.error})` : ''}
                  </p>
                  <p className="mt-1">
                    An expense like this is auto-approved with no approver.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create / Edit modal */}
      {showForm && (
        <div className="modal-overlay" onClick={closeForm}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">
                {editingRule ? 'Edit Approval Rule' : 'Create Approval Rule'}
              </h3>
              <button onClick={closeForm} className="modal-close" aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              {formError && (
                <div className="alert alert-error mb-4">
                  <XCircle size={20} style={{ flexShrink: 0 }} />
                  <div>{formError}</div>
                </div>
              )}

              <form onSubmit={handleSubmit}>
                <div className="form-grid">
                  <div className="form-group form-grid-full">
                    <label className="form-label">Rule Name *</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => handleInputChange('name', e.target.value)}
                      placeholder="Standard Approval"
                      className="form-input"
                      required
                    />
                  </div>

                  <div className="form-group form-grid-full">
                    <label className="form-label">Description</label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => handleInputChange('description', e.target.value)}
                      placeholder="Expenses in this range need two levels of manager approval"
                      className="form-textarea"
                      rows="2"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Minimum Amount *</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.minAmount}
                      onChange={(e) => handleInputChange('minAmount', e.target.value)}
                      placeholder="0.00"
                      className="form-input"
                      required
                    />
                    <p className="form-hint">Inclusive - an expense of exactly this amount matches</p>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Maximum Amount</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.unlimitedMax ? '' : formData.maxAmount}
                      onChange={(e) => handleInputChange('maxAmount', e.target.value)}
                      placeholder={formData.unlimitedMax ? 'Unlimited' : '500.00'}
                      className="form-input"
                      disabled={formData.unlimitedMax}
                    />
                    <div className="form-checkbox mt-2">
                      <input
                        type="checkbox"
                        id="unlimited-max"
                        checked={formData.unlimitedMax}
                        onChange={(e) => handleInputChange('unlimitedMax', e.target.checked)}
                      />
                      <label htmlFor="unlimited-max">No upper limit (unlimited)</label>
                    </div>
                    {clearingUpperLimit && (
                      <p className="form-hint form-hint-warning">
                        The API keeps the stored upper limit when it is cleared on an update.
                        To make this rule unlimited, delete it and create it again.
                      </p>
                    )}
                  </div>

                  <div className="form-group">
                    <label className="form-label">Approval Levels Required *</label>
                    <select
                      value={formData.levelsRequired}
                      onChange={(e) => handleInputChange('levelsRequired', e.target.value)}
                      className="form-select"
                      required
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((level) => (
                        <option key={level} value={level}>
                          {level} {level === 1 ? 'level' : 'levels'} up the org chart
                        </option>
                      ))}
                    </select>
                    <p className="form-hint">How many managers above the submitter must approve</p>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Cost Center Scope</label>
                    <select
                      value={formData.costCenterId}
                      onChange={(e) => handleInputChange('costCenterId', e.target.value)}
                      className="form-select"
                    >
                      <option value="">All cost centers (org-wide)</option>
                      {costCenters.map((cc) => (
                        <option key={cc.id} value={cc.id}>
                          {cc.code} - {cc.name}
                        </option>
                      ))}
                    </select>
                    <p className="form-hint">
                      A cost-center-specific rule wins over an org-wide rule for that cost center
                    </p>
                    {clearingCostCenter && (
                      <p className="form-hint form-hint-warning">
                        The API keeps the stored cost center when it is cleared on an update.
                        To make this rule org-wide, delete it and create it again.
                      </p>
                    )}
                  </div>

                  <div className="form-group form-grid-full">
                    <div className="form-checkbox">
                      <input
                        type="checkbox"
                        id="rule-active"
                        checked={formData.isActive}
                        onChange={(e) => handleInputChange('isActive', e.target.checked)}
                      />
                      <label htmlFor="rule-active">
                        Active - inactive rules are ignored when matching expenses
                      </label>
                    </div>
                  </div>
                </div>

                <div className="form-actions">
                  <button type="submit" className="btn btn-primary" disabled={saving}>
                    <Save size={18} />
                    {saving ? 'Saving...' : editingRule ? 'Update Rule' : 'Create Rule'}
                  </button>
                  <button type="button" onClick={closeForm} className="btn btn-secondary">
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ApprovalRules;

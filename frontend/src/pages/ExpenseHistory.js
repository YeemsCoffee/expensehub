import React, { useState, useEffect, useCallback } from 'react';
import { Filter, X, Download, Edit2, Trash2, XCircle, RefreshCw } from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import { EXPENSE_CATEGORIES } from '../utils/constants';
import { formatCurrency } from '../utils/helpers';
import api from '../services/api';
import { useToast } from '../components/Toast';

const ExpenseHistory = () => {
  const toast = useToast();
  const [expenses, setExpenses] = useState([]);
  const [costCenters, setCostCenters] = useState([]);
  const [locations, setLocations] = useState([]);
  const [categories, setCategories] = useState(EXPENSE_CATEGORIES);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [successBanner, setSuccessBanner] = useState(null);

  const [retryingId, setRetryingId] = useState(null);

  // Check if current user is admin or developer
  const userStr = localStorage.getItem('user');
  const currentUser = userStr ? JSON.parse(userStr) : null;
  const isPrivileged = ['admin', 'developer'].includes(currentUser?.role);

  const [filters, setFilters] = useState({
    status: '',
    category: '',
    locationId: '',
    costCenterId: '',
    startDate: '',
    endDate: '',
    minAmount: '',
    maxAmount: ''
  });

  // Check for success info from cart checkout
  useEffect(() => {
    const successInfo = sessionStorage.getItem('expenseSubmitSuccess');
    if (successInfo) {
      try {
        const data = JSON.parse(successInfo);
        // Only show if submitted within last 5 seconds
        if (Date.now() - data.timestamp < 5000) {
          setSuccessBanner(data);
          // Auto-hide after 10 seconds
          setTimeout(() => setSuccessBanner(null), 10000);
        }
        // Clear from sessionStorage
        sessionStorage.removeItem('expenseSubmitSuccess');
      } catch (err) {
        console.error('Error parsing success info:', err);
      }
    }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const expensesResponse = await api.get('/expenses', { params: filters });
      setExpenses(expensesResponse.data);

      const [ccResponse, locResponse, catResponse] = await Promise.all([
        api.get('/cost-centers'),
        api.get('/locations'),
        api.get('/expense-categories').catch(() => null)
      ]);

      setCostCenters(ccResponse.data);
      setLocations(locResponse.data);
      if (catResponse && Array.isArray(catResponse.data) && catResponse.data.length > 0) {
        setCategories(catResponse.data.map(c => c.name));
      }
      setLoading(false);
    } catch (err) {
      console.error('Error fetching data:', err);
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleFilterChange = (field, value) => {
    setFilters({ ...filters, [field]: value });
  };

  const clearFilters = () => {
    setFilters({
      status: '',
      category: '',
      locationId: '',
      costCenterId: '',
      startDate: '',
      endDate: '',
      minAmount: '',
      maxAmount: ''
    });
  };

  const handleRescind = async (expenseId) => {
    if (!window.confirm('Are you sure you want to rescind this expense? It will change the status to rejected.')) {
      return;
    }

    try {
      await api.post(`/expenses/${expenseId}/rescind`);
      toast.success('Expense rescinded successfully');
      fetchData();
    } catch (err) {
      console.error('Error rescinding expense:', err);
      toast.error(err.response?.data?.error || 'Failed to rescind expense');
    }
  };

  const handleDelete = async (expenseId) => {
    if (!window.confirm('Are you sure you want to delete this expense? This action cannot be undone.')) {
      return;
    }

    try {
      await api.delete(`/expenses/${expenseId}`);
      toast.success('Expense deleted successfully');
      fetchData();
    } catch (err) {
      console.error('Error deleting expense:', err);
      toast.error(err.response?.data?.error || 'Failed to delete expense');
    }
  };

  const handleRetryAmazonOrder = async (expenseId) => {
    setRetryingId(expenseId);
    try {
      const res = await api.post(`/amazon-punchout/admin/retry-order/${expenseId}`);
      toast.success(`Order placed successfully! PO: ${res.data.poNumber}`);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to retry Amazon order');
    } finally {
      setRetryingId(null);
    }
  };

  const canModifyExpense = (expense) => {
    // Admin/developer can modify any expense
    if (isPrivileged) return true;
    // Regular users can only modify pending or rejected expenses
    return expense.status === 'pending' || expense.status === 'rejected';
  };

  const canRescind = (expense) => {
    // Can only rescind pending expenses
    return expense.status === 'pending';
  };

  const handleExport = () => {
    if (expenses.length === 0) {
      toast.error('No expenses to export');
      return;
    }

    // Prepare CSV headers
    const headers = ['Date', 'Description', 'Category', 'Cost Center', 'Location', 'Amount', 'Status', 'Vendor'];

    // Prepare CSV rows
    const rows = expenses.map(expense => [
      new Date(expense.date).toLocaleDateString(),
      expense.description,
      expense.category,
      expense.cost_center_code,
      expense.location_code || '-',
      parseFloat(expense.amount).toFixed(2),
      expense.status.charAt(0).toUpperCase() + expense.status.slice(1),
      expense.vendor_name || '-'
    ]);

    // Combine headers and rows
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => {
        // Escape commas and quotes in cell content
        const cellStr = String(cell);
        if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
          return `"${cellStr.replace(/"/g, '""')}"`;
        }
        return cellStr;
      }).join(','))
    ].join('\n');

    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', `expenses_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success(`Exported ${expenses.length} expense${expenses.length !== 1 ? 's' : ''} to CSV`);
  };

  if (loading) {
    return <div className="page-title">Loading expenses...</div>;
  }

  const activeFilterCount = Object.values(filters).filter(v => v !== '').length;

  return (
    <div className="container">
      <h2 className="page-title">Expense History</h2>

      {/* Success Banner */}
      {successBanner && (
        <div className="alert alert-success mb-4" style={{ position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between' }}>
            <div>
              <strong style={{ fontSize: '16px' }}>
                {successBanner.autoApproved ? '✓ Expenses Automatically Approved!' : '✓ Expenses Submitted Successfully!'}
              </strong>
              <p style={{ margin: '8px 0 0 0', fontSize: '14px' }}>
                {successBanner.count} expense{successBanner.count > 1 ? 's' : ''} created • Total: ${successBanner.total}
                {successBanner.autoApproved
                  ? ' • Ready for processing'
                  : ' • Awaiting manager approval'}
              </p>
            </div>
            <button
              onClick={() => setSuccessBanner(null)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
                color: 'inherit',
                opacity: 0.7
              }}
              onMouseOver={(e) => e.currentTarget.style.opacity = '1'}
              onMouseOut={(e) => e.currentTarget.style.opacity = '0.7'}
            >
              <X size={20} />
            </button>
          </div>
        </div>
      )}

      <div className="card mb-4">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 className="card-title">
            {isPrivileged ? 'All Expenses (All Users)' : 'My Expenses'}
            {activeFilterCount > 0 && (
              <span className="badge badge-info ml-2">{activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''}</span>
            )}
          </h3>
          <div style={{ display: 'flex', gap: '10px' }}>
            {activeFilterCount > 0 && (
              <button onClick={clearFilters} className="btn btn-secondary">
                <X size={16} />
                Clear Filters
              </button>
            )}
            <button onClick={() => setShowFilters(!showFilters)} className="btn btn-secondary">
              <Filter size={16} />
              {showFilters ? 'Hide Filters' : 'Show Filters'}
            </button>
            <button onClick={handleExport} className="btn btn-secondary" title="Export expenses to CSV">
              <Download size={16} />
              Export
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="form-grid mb-4" style={{ borderTop: '1px solid #e5e7eb', paddingTop: '16px' }}>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select value={filters.status} onChange={(e) => handleFilterChange('status', e.target.value)} className="form-select">
                <option value="">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Category</label>
              <select value={filters.category} onChange={(e) => handleFilterChange('category', e.target.value)} className="form-select">
                <option value="">All Categories</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Location</label>
              <select value={filters.locationId} onChange={(e) => handleFilterChange('locationId', e.target.value)} className="form-select">
                <option value="">All Locations</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Cost Center</label>
              <select value={filters.costCenterId} onChange={(e) => handleFilterChange('costCenterId', e.target.value)} className="form-select">
                <option value="">All Cost Centers</option>
                {costCenters.map((cc) => (
                  <option key={cc.id} value={cc.id}>{cc.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Start Date</label>
              <input type="date" value={filters.startDate} onChange={(e) => handleFilterChange('startDate', e.target.value)} className="form-input" />
            </div>

            <div className="form-group">
              <label className="form-label">End Date</label>
              <input type="date" value={filters.endDate} onChange={(e) => handleFilterChange('endDate', e.target.value)} className="form-input" />
            </div>

            <div className="form-group">
              <label className="form-label">Min Amount</label>
              <input type="number" step="0.01" value={filters.minAmount} onChange={(e) => handleFilterChange('minAmount', e.target.value)} placeholder="0.00" className="form-input" />
            </div>

            <div className="form-group">
              <label className="form-label">Max Amount</label>
              <input type="number" step="0.01" value={filters.maxAmount} onChange={(e) => handleFilterChange('maxAmount', e.target.value)} placeholder="0.00" className="form-input" />
            </div>
          </div>
        )}

        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Category</th>
                {isPrivileged && <th>Submitted By</th>}
                <th>Cost Center</th>
                <th>Location</th>
                <th>Amount</th>
                <th>Status</th>
                <th style={{ minWidth: '120px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {expenses.length === 0 ? (
                <tr>
                  <td colSpan={isPrivileged ? 9 : 8} style={{ textAlign: 'center', padding: '40px' }}>
                    <p className="text-gray-500">No expenses found</p>
                  </td>
                </tr>
              ) : (
                expenses.map((expense) => (
                  <tr key={expense.id}>
                    <td>{new Date(expense.date).toLocaleDateString()}</td>
                    <td>
                      <div>
                        <div>{expense.description}</div>
                        {expense.vendor_name && (
                          <div className="text-xs text-gray-500">{expense.vendor_name}</div>
                        )}
                      </div>
                    </td>
                    <td>{expense.category}</td>
                    {isPrivileged && <td>{expense.submitted_by_name || '-'}</td>}
                    <td>{expense.cost_center_code}</td>
                    <td>{expense.location_code || '-'}</td>
                    <td>{formatCurrency(parseFloat(expense.amount))}</td>
                    <td>
                      <StatusBadge status={expense.status} />
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'nowrap' }}>
                        {canRescind(expense) && (
                          <button
                            onClick={() => handleRescind(expense.id)}
                            className="btn-icon"
                            title="Rescind (withdraw) expense"
                            style={{ color: '#f59e0b' }}
                          >
                            <XCircle size={18} />
                          </button>
                        )}
                        {canModifyExpense(expense) && (
                          <button
                            onClick={() => window.location.hash = `#expenses-submit?edit=${expense.id}`}
                            className="btn-icon"
                            title="Edit expense"
                            style={{ color: '#2B4628' }}
                          >
                            <Edit2 size={18} />
                          </button>
                        )}
                        {canModifyExpense(expense) && (
                          <button
                            onClick={() => handleDelete(expense.id)}
                            className="btn-icon"
                            title="Delete expense"
                            style={{ color: '#ef4444' }}
                          >
                            <Trash2 size={18} />
                          </button>
                        )}
                        {!canModifyExpense(expense) && expense.status === 'approved' && !expense.amazon_spaid && (
                          <span className="text-xs text-gray-500" style={{ padding: '4px' }}>
                            Approved
                          </span>
                        )}
                        {isPrivileged && expense.amazon_spaid && expense.amazon_order_status !== 'confirmed' && (
                          <button
                            onClick={() => handleRetryAmazonOrder(expense.id)}
                            className="btn-icon"
                            title={`Retry Amazon order (status: ${expense.amazon_order_status || 'pending'})`}
                            style={{ color: '#f97316' }}
                            disabled={retryingId === expense.id}
                          >
                            <RefreshCw size={18} style={retryingId === expense.id ? { animation: 'spin 1s linear infinite' } : {}} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ExpenseHistory;

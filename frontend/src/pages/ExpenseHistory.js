import React, { useState, useEffect, useCallback } from 'react';
import { Filter, X, Download } from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import { EXPENSE_CATEGORIES } from '../utils/constants';
import { formatCurrency } from '../utils/helpers';
import api from '../services/api';

const ExpenseHistory = () => {
  const [expenses, setExpenses] = useState([]);
  const [costCenters, setCostCenters] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  
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

  const fetchData = useCallback(async () => {
    try {
      const expensesResponse = await api.get('/expenses', { params: filters });
      setExpenses(expensesResponse.data);

      const [ccResponse, locResponse] = await Promise.all([
        api.get('/cost-centers'),
        api.get('/locations')
      ]);

      setCostCenters(ccResponse.data);
      setLocations(locResponse.data);
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

  if (loading) {
    return <div className="page-title">Loading expenses...</div>;
  }

  const activeFilterCount = Object.values(filters).filter(v => v !== '').length;

  return (
    <div>
      <h2 className="page-title">Expense History</h2>
      
      <div className="card mb-4">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 className="card-title">
            All Expenses
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
            <button className="btn btn-secondary">
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
                {EXPENSE_CATEGORIES.map((cat) => (
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
                <th>Cost Type</th>
                <th>Cost Center</th>
                <th>Location</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {expenses.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '40px' }}>
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
                    <td>
                      <span className={`badge ${expense.cost_type === 'CAPEX' ? 'badge-info' : 'badge-secondary'}`}>
                        {expense.cost_type || 'OPEX'}
                      </span>
                    </td>
                    <td>{expense.cost_center_code}</td>
                    <td>{expense.location_code || '-'}</td>
                    <td>{formatCurrency(parseFloat(expense.amount))}</td>
                    <td>
                      <StatusBadge status={expense.status} />
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
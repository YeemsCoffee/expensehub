import React, { useState, useEffect, useCallback } from 'react';
import { DollarSign, Clock, CheckCircle, TrendingUp, FileText, PieChart, BarChart3, MapPin, Folder, Receipt, AlertCircle, RefreshCw } from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import { formatCurrency } from '../utils/helpers';
import api from '../services/api';

const Dashboard = () => {
  const [expenses, setExpenses] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [categoryBreakdown, setCategoryBreakdown] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [timeRange, setTimeRange] = useState('thisMonth');

  const getDateRange = useCallback(() => {
    const now = new Date();
    let startDate, endDate;

    switch(timeRange) {
      case 'thisMonth':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      case 'lastMonth':
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
      case 'thisQuarter':
        const quarter = Math.floor(now.getMonth() / 3);
        startDate = new Date(now.getFullYear(), quarter * 3, 1);
        endDate = new Date(now.getFullYear(), (quarter + 1) * 3, 0);
        break;
      case 'thisYear':
        startDate = new Date(now.getFullYear(), 0, 1);
        endDate = new Date(now.getFullYear(), 11, 31);
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    }

    return {
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0]
    };
  }, [timeRange]);

  const fetchDashboardData = useCallback(async (isRefetch) => {
    if (isRefetch) {
      setRefreshing(true);
    }
    setError(null);

    try {
      const { startDate, endDate } = getDateRange();

      // Independent requests - run them concurrently.
      // Every figure on this page comes from the analytics endpoints, so asking
      // for only the 10 most recent expenses does not affect any displayed total.
      const [expensesResponse, analyticsResponse, categoryResponse] = await Promise.all([
        api.get('/expenses', { params: { limit: 10 } }),
        api.get('/expenses/analytics/summary', { params: { startDate, endDate } }),
        api.get('/expenses/analytics/by-category', { params: { startDate, endDate } })
      ]);

      setExpenses(expensesResponse.data);
      setAnalytics(analyticsResponse.data);
      setCategoryBreakdown(categoryResponse.data.slice(0, 5));
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setError('Couldn’t load dashboard data. Your connection or the server may be having trouble.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [getDateRange]);

  // isRefetch is false only on the very first call (loading spinner instead of the
  // lighter refreshing indicator); every later call - e.g. changing the time range -
  // passes true.
  const isFirstRun = React.useRef(true);
  useEffect(() => {
    fetchDashboardData(!isFirstRun.current);
    isFirstRun.current = false;
  }, [fetchDashboardData]);

  if (loading) {
    return (
      <div className="container">
        <div className="flex-center" style={{ minHeight: '40vh' }}>
          <span className="loading loading-lg" />
        </div>
      </div>
    );
  }

  if (error && !analytics) {
    return (
      <div className="container">
        <div className="alert alert-error">
          <AlertCircle size={20} />
          <div>
            <p>{error}</p>
            <button className="btn btn-secondary btn-sm mt-8" onClick={() => fetchDashboardData(true)}>
              <RefreshCw size={16} /> Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const stats = [
    {
      label: 'Total Expenses',
      value: formatCurrency(parseFloat(analytics?.total_amount) || 0),
      subtext: `${analytics?.total_count || 0} transactions`,
      icon: DollarSign,
      iconClass: 'blue'
    },
    {
      label: 'Pending Approval',
      value: formatCurrency(parseFloat(analytics?.pending_total) || 0),
      subtext: 'Awaiting review',
      icon: Clock,
      iconClass: 'yellow'
    },
    {
      label: 'Approved',
      value: formatCurrency(parseFloat(analytics?.approved_total) || 0),
      subtext: 'Ready for processing',
      icon: CheckCircle,
      iconClass: 'green'
    },
    {
      label: 'Avg per Expense',
      value: formatCurrency(parseFloat(analytics?.avg_amount) || 0),
      subtext: 'Average amount',
      icon: TrendingUp,
      iconClass: 'tan'
    }
  ];

  const costTypeStats = [
    {
      label: 'OPEX',
      value: formatCurrency(parseFloat(analytics?.opex_total) || 0),
      percent: analytics?.total_amount ? ((parseFloat(analytics.opex_total) / parseFloat(analytics.total_amount)) * 100).toFixed(1) : 0,
      type: 'opex'
    },
    {
      label: 'CAPEX',
      value: formatCurrency(parseFloat(analytics?.capex_total) || 0),
      percent: analytics?.total_amount ? ((parseFloat(analytics.capex_total) / parseFloat(analytics.total_amount)) * 100).toFixed(1) : 0,
      type: 'capex'
    }
  ];

  const getTimeRangeLabel = () => {
    switch(timeRange) {
      case 'thisMonth': return 'This Month';
      case 'lastMonth': return 'Last Month';
      case 'thisQuarter': return 'This Quarter';
      case 'thisYear': return 'This Year';
      default: return 'This Month';
    }
  };

  return (
    <div className="container">
      <div className="dashboard-header">
        <h2 className="page-title">Dashboard</h2>
        <div className="flex items-center gap-8">
          {refreshing && <span className="loading" aria-label="Refreshing" />}
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="form-select"
            disabled={refreshing}
            aria-label="Time range"
          >
            <option value="thisMonth">This Month</option>
            <option value="lastMonth">Last Month</option>
            <option value="thisQuarter">This Quarter</option>
            <option value="thisYear">This Year</option>
          </select>
        </div>
      </div>

      {error && analytics && (
        <div className="alert alert-error mb-8">
          <AlertCircle size={18} />
          <div>
            <p>{error} Numbers below are from the last successful load.</p>
          </div>
        </div>
      )}

      <p className="dashboard-timerange-info">Showing data for: <strong>{getTimeRangeLabel()}</strong></p>

      <div className="stats-grid" aria-live="polite" aria-busy={refreshing}>
        {stats.map((stat, index) => (
          <div key={index} className={`stat-card stat-card-${stat.iconClass}`}>
            <div className="stat-card-content">
              <div>
                <p className="stat-label">{stat.label}</p>
                <p className="stat-value">{stat.value}</p>
                {stat.subtext && <p className="stat-subtext">{stat.subtext}</p>}
              </div>
              <div className={`stat-icon stat-icon-${stat.iconClass}`}>
                <stat.icon size={22} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="card mt-6">
        <div className="card-section-header">
          <PieChart size={20} className="card-section-icon" />
          <h3 className="card-title">Cost Type Breakdown</h3>
        </div>
        <div className="cost-type-breakdown">
          {costTypeStats.map((stat, index) => (
            <div key={index} className={`cost-type-card ${stat.type}`}>
              <div className="cost-type-header">
                <span className="cost-type-label">{stat.label}</span>
                <span className={`cost-type-percent ${stat.type}`}>{stat.percent}%</span>
              </div>
              <div className="cost-type-amount">{stat.value}</div>
              <div className="cost-type-progress">
                <div className={`cost-type-progress-bar ${stat.type}`} style={{ width: `${stat.percent}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card mt-4">
        <div className="card-section-header">
          <BarChart3 size={20} className="card-section-icon" />
          <h3 className="card-title">Top Spending Categories</h3>
        </div>
        {categoryBreakdown.length === 0 ? (
          <p className="no-data-message">No expense data available</p>
        ) : (
          <div className="category-breakdown">
            {(() => {
              const maxAmount = Math.max(...categoryBreakdown.map(c => parseFloat(c.total_amount)));
              return categoryBreakdown.map((cat, index) => {
                const percent = (parseFloat(cat.total_amount) / maxAmount) * 100;

                return (
                  <div key={index} className="category-item">
                    <div className="category-header">
                      <span className="category-name">{cat.category}</span>
                      <span className="category-amount">
                        {formatCurrency(parseFloat(cat.total_amount))}
                      </span>
                    </div>
                    <div className="category-progress-bar">
                      <div className="category-progress-fill" style={{ width: `${percent}%` }} />
                    </div>
                    <span className="category-count">{cat.count} transaction{cat.count !== 1 ? 's' : ''}</span>
                  </div>
                );
              });
            })()}
          </div>
        )}
      </div>

      {analytics?.reimbursable_total > 0 && (
        <div className="card reimbursable-card">
          <div className="reimbursable-content">
            <DollarSign size={24} className="reimbursable-icon" />
            <div>
              <p className="reimbursable-title">Reimbursable Expenses</p>
              <p className="reimbursable-amount">
                {formatCurrency(parseFloat(analytics.reimbursable_total) || 0)}
              </p>
              <p className="reimbursable-description">Pending reimbursement to employees</p>
            </div>
          </div>
        </div>
      )}

      <div className="card mt-4">
        <div className="card-section-header">
          <Receipt size={20} className="card-section-icon" />
          <h3 className="card-title">Recent Expenses</h3>
        </div>
        <div className="expense-list">
          {expenses.length === 0 ? (
            <p className="no-data-message">No expenses yet</p>
          ) : (
            expenses.map((expense) => (
              <div
                key={expense.id}
                className="expense-item"
                role="button"
                tabIndex={0}
                onClick={() => { window.location.hash = `#expenses-history?highlight=${expense.id}`; }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    window.location.hash = `#expenses-history?highlight=${expense.id}`;
                  }
                }}
              >
                <div className="expense-item-left">
                  <FileText className="expense-item-icon" />
                  <div>
                    <p className="expense-item-title">{expense.description}</p>
                    <p className="expense-item-meta">
                      {expense.category}
                      {expense.location_code && (
                        <>
                          <span className="expense-item-meta-separator">•</span>
                          <MapPin size={12} className="expense-item-meta-icon" />
                          {expense.location_code}
                        </>
                      )}
                      {expense.project_code && (
                        <>
                          <span className="expense-item-meta-separator">•</span>
                          <Folder size={12} className="expense-item-meta-icon" />
                          {expense.project_code}
                        </>
                      )}
                      <span className="expense-item-meta-separator">•</span>
                      {new Date(expense.date).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="expense-item-right">
                  <div className="expense-item-amount-section">
                    <span className="expense-item-amount">{formatCurrency(parseFloat(expense.amount))}</span>
                    <div>
                      <span className={`badge expense-cost-type-badge ${expense.cost_type === 'CAPEX' ? 'badge-info' : 'badge-secondary'}`}>
                        {expense.cost_type || 'OPEX'}
                      </span>
                    </div>
                  </div>
                  <StatusBadge status={expense.status} />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
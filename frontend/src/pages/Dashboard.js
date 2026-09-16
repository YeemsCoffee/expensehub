import React, { useState, useEffect, useCallback } from 'react';
import { DollarSign, Clock, CheckCircle, TrendingUp, FileText, PieChart, BarChart3, MapPin, Folder, Receipt, AlertCircle, RefreshCw, Building2, ChevronDown, ChevronUp } from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import { formatCurrency } from '../utils/helpers';
import api from '../services/api';

const Dashboard = () => {
  const [expenses, setExpenses] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [categoryBreakdown, setCategoryBreakdown] = useState([]);
  const [costCenterBreakdown, setCostCenterBreakdown] = useState([]);
  const [expandedCostCenter, setExpandedCostCenter] = useState(null);
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
      const [expensesResponse, analyticsResponse, categoryResponse, costCenterResponse] = await Promise.all([
        api.get('/expenses', { params: { limit: 10 } }),
        api.get('/expenses/analytics/summary', { params: { startDate, endDate } }),
        api.get('/expenses/analytics/by-category', { params: { startDate, endDate } }),
        api.get('/expenses/analytics/by-cost-center', { params: { startDate, endDate } })
      ]);

      setExpenses(expensesResponse.data);
      setAnalytics(analyticsResponse.data);
      setCategoryBreakdown(categoryResponse.data.slice(0, 5));
      setCostCenterBreakdown(costCenterResponse.data);
      // Collapse any open drill-down when the time range changes
      setExpandedCostCenter(null);
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

  // `total_amount` arrives as a numeric string (e.g. "0.00"), which is truthy even
  // when the value is zero — checking it directly let a 0/0 division through as NaN.
  const totalAmount = parseFloat(analytics?.total_amount) || 0;

  const costTypeStats = [
    {
      label: 'OPEX',
      value: formatCurrency(parseFloat(analytics?.opex_total) || 0),
      percent: totalAmount ? ((parseFloat(analytics.opex_total) / totalAmount) * 100).toFixed(1) : 0,
      type: 'opex'
    },
    {
      label: 'CAPEX',
      value: formatCurrency(parseFloat(analytics?.capex_total) || 0),
      percent: totalAmount ? ((parseFloat(analytics.capex_total) / totalAmount) * 100).toFixed(1) : 0,
      type: 'capex'
    }
  ];

  // Total across cost centers, used to show each one's share
  const costCenterTotal = costCenterBreakdown.reduce((sum, cc) => sum + cc.total_amount, 0);

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
          <Building2 size={20} className="card-section-icon" />
          <h3 className="card-title">Spend by Cost Center</h3>
        </div>
        {costCenterBreakdown.length === 0 ? (
          <p className="no-data-message">No expense data available</p>
        ) : (
          <div className="cc-list">
            {costCenterBreakdown.map((cc) => {
              const key = cc.cost_center_id === null ? 'unassigned' : cc.cost_center_id;
              const isExpanded = expandedCostCenter === key;
              const share = costCenterTotal > 0 ? (cc.total_amount / costCenterTotal) * 100 : 0;
              const maxCat = cc.categories.length
                ? Math.max(...cc.categories.map((c) => c.total_amount))
                : 0;

              return (
                <div key={key} className={`cc-card ${isExpanded ? 'expanded' : ''}`}>
                  <button
                    type="button"
                    className="cc-card-header"
                    onClick={() => setExpandedCostCenter(isExpanded ? null : key)}
                    aria-expanded={isExpanded}
                  >
                    <div className="cc-card-title">
                      <span className="cc-code">{cc.cost_center_code || '—'}</span>
                      <span className="cc-name">{cc.cost_center_name}</span>
                    </div>
                    <div className="cc-card-right">
                      <div className="cc-amounts">
                        <span className="cc-total">{formatCurrency(cc.total_amount)}</span>
                        <span className="cc-count">
                          {cc.count} transaction{cc.count !== 1 ? 's' : ''}
                        </span>
                      </div>
                      {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </div>
                  </button>

                  <div className="cc-share-bar">
                    <div className="cc-share-fill" style={{ width: `${share}%` }} />
                  </div>

                  <div className="cc-meta">
                    <span className="cc-chip approved">Approved {formatCurrency(cc.approved_amount)}</span>
                    <span className="cc-chip pending">Pending {formatCurrency(cc.pending_amount)}</span>
                    <span className="cc-share">{share.toFixed(1)}% of total</span>
                  </div>

                  {isExpanded && (
                    <div className="cc-categories">
                      <p className="cc-categories-label">By category</p>
                      {cc.categories.map((cat) => (
                        <div key={cat.category} className="cc-cat-item">
                          <div className="cc-cat-header">
                            <span className="cc-cat-name">{cat.category}</span>
                            <span className="cc-cat-amount">{formatCurrency(cat.total_amount)}</span>
                          </div>
                          <div className="cc-cat-bar">
                            <div
                              className="cc-cat-fill"
                              style={{ width: `${maxCat > 0 ? (cat.total_amount / maxCat) * 100 : 0}%` }}
                            />
                          </div>
                          <span className="cc-cat-count">
                            {cat.count} transaction{cat.count !== 1 ? 's' : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
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

      <style>{`
        .cc-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .cc-card {
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 0.875rem 1rem;
          background: #fff;
          transition: border-color 0.2s, box-shadow 0.2s;
        }

        .cc-card:hover { border-color: #BCD7DE; }
        .cc-card.expanded {
          border-color: #BCD7DE;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
        }

        .cc-card-header {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          background: none;
          border: none;
          padding: 0;
          cursor: pointer;
          text-align: left;
          color: inherit;
          font: inherit;
        }

        .cc-card-title {
          display: flex;
          align-items: baseline;
          gap: 0.5rem;
          min-width: 0;
        }

        .cc-code {
          font-size: 0.75rem;
          font-weight: 700;
          color: #2B4628;
          background: #f3f6f2;
          padding: 0.125rem 0.375rem;
          border-radius: 4px;
          white-space: nowrap;
        }

        .cc-name {
          font-size: 0.9375rem;
          font-weight: 600;
          color: #111827;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .cc-card-right {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          color: #6b7280;
          flex-shrink: 0;
        }

        .cc-amounts {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
        }

        .cc-total {
          font-size: 1.0625rem;
          font-weight: 700;
          color: #2B4628;
        }

        .cc-count { font-size: 0.75rem; color: #6b7280; }

        .cc-share-bar {
          height: 6px;
          background: #f3f4f6;
          border-radius: 3px;
          overflow: hidden;
          margin: 0.625rem 0 0.5rem;
        }

        .cc-share-fill {
          height: 100%;
          background: #2B4628;
          border-radius: 3px;
        }

        .cc-meta {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-wrap: wrap;
          font-size: 0.75rem;
        }

        .cc-chip {
          padding: 0.125rem 0.5rem;
          border-radius: 999px;
          font-weight: 600;
        }

        .cc-chip.approved { background: #f3f6f2; color: #2B4628; }
        .cc-chip.pending { background: #fef3c7; color: #92400e; }
        .cc-share { color: #6b7280; margin-left: auto; }

        .cc-categories {
          margin-top: 0.875rem;
          padding-top: 0.875rem;
          border-top: 1px dashed #e5e7eb;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .cc-categories-label {
          font-size: 0.6875rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #6b7280;
          margin: 0;
        }

        .cc-cat-header {
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          font-size: 0.875rem;
        }

        .cc-cat-name { color: #374151; }
        .cc-cat-amount { font-weight: 600; color: #111827; white-space: nowrap; }

        .cc-cat-bar {
          height: 4px;
          background: #f3f4f6;
          border-radius: 2px;
          overflow: hidden;
          margin: 0.25rem 0 0.125rem;
        }

        .cc-cat-fill { height: 100%; background: #BCD7DE; border-radius: 2px; }
        .cc-cat-count { font-size: 0.6875rem; color: #9ca3af; }

        @media (max-width: 640px) {
          .cc-card-header { align-items: flex-start; }
          .cc-name { white-space: normal; }
          .cc-share { margin-left: 0; }
        }
      `}</style>
    </div>
  );
};

export default Dashboard;
import React, { useState, useEffect } from 'react';
import { Plus, DollarSign, Clock, CheckCircle, AlertCircle, Calendar, ChevronRight } from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import { formatCurrency } from '../utils/helpers';
import api from '../services/api';

const RECENT_LIMIT = 5;
const TOTALS_PAGE_SIZE = 200; // server-side maximum per request
const TOTALS_MAX_PAGES = 20; // runaway guard - 4,000 expenses

// The hero figures are sums over every expense, not just the ones on screen, so they
// are gathered in bounded pages instead of one unbounded request. Only the running
// totals are kept, never the full row set.
const fetchReimbursementTotals = async () => {
  const totals = {
    pendingAmount: 0,
    approvedAmount: 0,
    pendingCount: 0,
    approvedCount: 0
  };

  let offset = 0;
  let total = null;

  for (let pageIndex = 0; pageIndex < TOTALS_MAX_PAGES; pageIndex++) {
    const response = await api.get('/expenses', {
      params: { limit: TOTALS_PAGE_SIZE, offset }
    });

    response.data.forEach((expense) => {
      if (!expense.is_reimbursable) return;

      if (expense.status === 'pending') {
        totals.pendingAmount += parseFloat(expense.amount);
        totals.pendingCount++;
      } else if (expense.status === 'approved') {
        totals.approvedAmount += parseFloat(expense.amount);
        totals.approvedCount++;
      }
    });

    if (total === null) {
      const headerCount = parseInt(response.headers['x-total-count'], 10);
      total = Number.isNaN(headerCount) ? response.data.length : headerCount;
    }

    offset += TOTALS_PAGE_SIZE;

    if (response.data.length === 0 || offset >= total) {
      return totals;
    }
  }

  console.warn(`Reimbursement totals truncated after ${TOTALS_MAX_PAGES * TOTALS_PAGE_SIZE} expenses`);
  return totals;
};

const EmployeeHome = ({ onNavigate }) => {
  const [reimbursementData, setReimbursementData] = useState({
    pendingAmount: 0,
    approvedAmount: 0,
    pendingCount: 0,
    approvedCount: 0
  });
  const [recentExpenses, setRecentExpenses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEmployeeData();
  }, []);

  const fetchEmployeeData = async () => {
    try {
      // The recent list only needs a handful of rows; the totals are collected
      // separately so the list request stays small.
      const [recentResponse, totals] = await Promise.all([
        api.get('/expenses', { params: { limit: RECENT_LIMIT } }),
        fetchReimbursementTotals()
      ]);

      setReimbursementData(totals);
      setRecentExpenses(recentResponse.data);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching employee data:', err);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="employee-home">
        <div className="skeleton skeleton-hero"></div>
        <div className="skeleton skeleton-button"></div>
        <div className="skeleton skeleton-list"></div>
      </div>
    );
  }

  const totalReimbursement = reimbursementData.pendingAmount + reimbursementData.approvedAmount;

  return (
    <div className="employee-home">
      
      {/* Hero Section - Most Important Info */}
      <div className="reimbursement-hero">
        <div className="hero-icon">
          <DollarSign size={40} />
        </div>
        <div className="hero-content">
          <h1 className="hero-amount">{formatCurrency(totalReimbursement)}</h1>
          <p className="hero-label">Total pending reimbursement</p>
          
          {totalReimbursement > 0 && (
            <div className="hero-breakdown">
              {reimbursementData.approvedAmount > 0 && (
                <div className="breakdown-item breakdown-approved">
                  <CheckCircle size={16} />
                  <span>{formatCurrency(reimbursementData.approvedAmount)} approved</span>
                </div>
              )}
              {reimbursementData.pendingAmount > 0 && (
                <div className="breakdown-item breakdown-pending">
                  <Clock size={16} />
                  <span>{formatCurrency(reimbursementData.pendingAmount)} awaiting approval</span>
                </div>
              )}
            </div>
          )}
          
          {reimbursementData.approvedAmount > 0 && (
            <p className="hero-subtitle">
              <Calendar size={16} />
              Approved amounts will be reimbursed in the next payroll cycle
            </p>
          )}
        </div>
      </div>

      {/* Primary Action - Big and Obvious */}
      <button 
        className="btn-submit-expense"
        onClick={() => onNavigate('expenses-submit')}
      >
        <div className="btn-icon-wrapper">
          <Plus size={24} />
        </div>
        <div className="btn-text">
          <span className="btn-title">Submit New Expense</span>
          <span className="btn-subtitle">Add receipt and get reimbursed</span>
        </div>
        <ChevronRight size={20} className="btn-arrow" />
      </button>

      {/* Quick Stats */}
      {totalReimbursement > 0 && (
        <div className="quick-stats">
          <div className="stat-item">
            <div className="stat-icon stat-icon-pending">
              <Clock size={20} />
            </div>
            <div className="stat-content">
              <p className="stat-value">{reimbursementData.pendingCount}</p>
              <p className="stat-label">Pending approval</p>
            </div>
          </div>
          
          <div className="stat-item">
            <div className="stat-icon stat-icon-approved">
              <CheckCircle size={20} />
            </div>
            <div className="stat-content">
              <p className="stat-value">{reimbursementData.approvedCount}</p>
              <p className="stat-label">Approved</p>
            </div>
          </div>
        </div>
      )}

      {/* Recent Activity */}
      <div className="recent-section">
        <div className="section-header">
          <h2 className="section-title">Recent Expenses</h2>
          <button 
            className="btn-link"
            onClick={() => onNavigate('expenses-history')}
          >
            View all <ChevronRight size={16} />
          </button>
        </div>

        {recentExpenses.length === 0 ? (
          <div className="empty-state-inline">
            <AlertCircle size={48} className="empty-icon" />
            <h3>No expenses yet</h3>
            <p>Submit your first expense to get started</p>
            <button 
              className="btn btn-primary"
              onClick={() => onNavigate('expenses-submit')}
            >
              <Plus size={18} />
              Submit Expense
            </button>
          </div>
        ) : (
          <div className="expense-cards">
            {recentExpenses.map((expense) => (
              <div key={expense.id} className="expense-card-simple">
                <div className="expense-card-left">
                  <div className="expense-date">
                    <span className="date-day">
                      {new Date(expense.date).getDate()}
                    </span>
                    <span className="date-month">
                      {new Date(expense.date).toLocaleDateString('en-US', { month: 'short' })}
                    </span>
                  </div>
                  <div className="expense-details">
                    <h3 className="expense-title">{expense.description}</h3>
                    <p className="expense-meta">
                      {expense.category}
                      {expense.vendor_name && ` • ${expense.vendor_name}`}
                    </p>
                  </div>
                </div>
                <div className="expense-card-right">
                  <p className="expense-amount">{formatCurrency(parseFloat(expense.amount))}</p>
                  <StatusBadge status={expense.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Secondary Actions */}
      <div className="secondary-actions">
        <button
          className="action-tile"
          onClick={() => onNavigate('expenses-history')}
        >
          <div className="action-tile-icon">
            📋
          </div>
          <div className="action-tile-content">
            <h3>Expense History</h3>
            <p>View all your expenses</p>
          </div>
        </button>
      </div>

    </div>
  );
};

export default EmployeeHome;
import React, { useState, useEffect } from 'react';
import { Plus, DollarSign, Clock, CheckCircle, AlertCircle, Calendar, ChevronRight } from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import { formatCurrency } from '../utils/helpers';
import api from '../services/api';

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
      // Fetch user's expenses
      const expensesResponse = await api.get('/expenses');
      const expenses = expensesResponse.data;

      // Calculate reimbursement data
      const pending = expenses.filter(e => e.status === 'pending' && e.is_reimbursable);
      const approved = expenses.filter(e => e.status === 'approved' && e.is_reimbursable);

      const pendingAmount = pending.reduce((sum, e) => sum + parseFloat(e.amount), 0);
      const approvedAmount = approved.reduce((sum, e) => sum + parseFloat(e.amount), 0);

      setReimbursementData({
        pendingAmount,
        approvedAmount,
        pendingCount: pending.length,
        approvedCount: approved.length
      });

      // Get recent 5 expenses
      setRecentExpenses(expenses.slice(0, 5));
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
                    <h4 className="expense-title">{expense.description}</h4>
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
            <h4>Expense History</h4>
            <p>View all your expenses</p>
          </div>
        </button>
      </div>

    </div>
  );
};

export default EmployeeHome;
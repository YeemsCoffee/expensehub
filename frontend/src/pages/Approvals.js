import React, { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle, XCircle, Clock, DollarSign,
  User, Calendar, MessageSquare,
  ChevronDown, ChevronUp
} from 'lucide-react';
import api from '../services/api';
import { useToast } from '../components/Toast';
import StatusBadge from '../components/StatusBadge';

const Approvals = () => {
  const toast = useToast();
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedExpense, setExpandedExpense] = useState(null);
  const [actioningId, setActioningId] = useState(null);
  const [comments, setComments] = useState({});

  const fetchPendingApprovals = useCallback(async () => {
    try {
      const response = await api.get('/expense-approvals/pending-for-me');
      setPendingApprovals(response.data);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching pending approvals:', err);
      toast.error('Failed to load pending approvals');
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchPendingApprovals();
  }, [fetchPendingApprovals]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleApprove = async (expenseId) => {
    setActioningId(expenseId);

    try {
      await api.post(`/expense-approvals/${expenseId}/approve`, {
        comments: comments[expenseId] || ''
      });

      toast.success('Expense approved successfully');

      // Remove from list
      setPendingApprovals(prev => prev.filter(item => item.expense_id !== expenseId));
      setComments(prev => {
        const updated = { ...prev };
        delete updated[expenseId];
        return updated;
      });
    } catch (err) {
      console.error('Error approving expense:', err);
      toast.error(err.response?.data?.error || 'Failed to approve expense');
    } finally {
      setActioningId(null);
    }
  };

  const handleReject = async (expenseId) => {
    if (!comments[expenseId] || comments[expenseId].trim() === '') {
      toast.error('Please provide a reason for rejection');
      return;
    }

    setActioningId(expenseId);

    try {
      await api.post(`/expense-approvals/${expenseId}/reject`, {
        comments: comments[expenseId]
      });

      toast.success('Expense rejected');

      // Remove from list
      setPendingApprovals(prev => prev.filter(item => item.expense_id !== expenseId));
      setComments(prev => {
        const updated = { ...prev };
        delete updated[expenseId];
        return updated;
      });
    } catch (err) {
      console.error('Error rejecting expense:', err);
      toast.error(err.response?.data?.error || 'Failed to reject expense');
    } finally {
      setActioningId(null);
    }
  };

  const [autoApprovingAmazon, setAutoApprovingAmazon] = useState(false);

  const handleAutoApproveAmazonOrders = async () => {
    if (!window.confirm('This will auto-approve all pending Amazon orders and send them to Amazon. Continue?')) {
      return;
    }

    setAutoApprovingAmazon(true);

    try {
      const response = await api.post('/expenses/admin/auto-approve-pending-amazon-orders');

      if (response.data.success) {
        const { processed } = response.data;
        const successCount = processed.filter(p => p.status === 'success').length;
        const failedCount = processed.filter(p => p.status === 'failed' || p.status === 'error').length;

        if (successCount > 0) {
          toast.success(`Successfully approved and sent ${successCount} Amazon order(s)`);
        }
        if (failedCount > 0) {
          toast.error(`${failedCount} order(s) failed to process`);
        }
        if (processed.length === 0) {
          toast.info('No pending Amazon orders found');
        }

        // Refresh the pending approvals list
        fetchPendingApprovals();
      }
    } catch (err) {
      console.error('Error auto-approving Amazon orders:', err);
      toast.error(err.response?.data?.error || 'Failed to auto-approve Amazon orders');
    } finally {
      setAutoApprovingAmazon(false);
    }
  };

  const toggleExpanded = (expenseId) => {
    setExpandedExpense(expandedExpense === expenseId ? null : expenseId);
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="page-title">
        <div className="loading-spinner"></div>
        Loading pending approvals...
      </div>
    );
  }

  return (
    <div className="container">
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 className="page-title" style={{ marginBottom: '0.5rem' }}>Pending Approvals</h2>
          <p className="text-gray-600">Review and approve expense reports requiring your authorization</p>
        </div>
        <button
          onClick={handleAutoApproveAmazonOrders}
          disabled={autoApprovingAmazon}
          className="btn-secondary"
          style={{
            minWidth: '200px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem'
          }}
          title="Auto-approve all pending Amazon orders and send to Amazon"
        >
          {autoApprovingAmazon ? (
            <>
              <div className="loading-spinner" style={{ width: '16px', height: '16px' }}></div>
              Processing...
            </>
          ) : (
            <>
              <CheckCircle size={16} />
              Auto-Approve Amazon Orders
            </>
          )}
        </button>
      </div>

      {/* Summary Stats */}
      <div className="stats-grid" style={{ marginBottom: '2rem' }}>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#fef3c7', color: '#f59e0b' }}>
            <Clock size={24} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{pendingApprovals.length}</div>
            <div className="stat-label">Pending Approvals</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#f0f8fa', color: '#BCD7DE' }}>
            <DollarSign size={24} />
          </div>
          <div className="stat-content">
            <div className="stat-value">
              {formatCurrency(
                pendingApprovals.reduce((sum, item) => sum + parseFloat(item.amount), 0)
              )}
            </div>
            <div className="stat-label">Total Amount</div>
          </div>
        </div>
      </div>

      {/* Pending Approvals List */}
      <div className="card">
        {pendingApprovals.length === 0 ? (
          <div className="empty-state">
            <CheckCircle size={48} style={{ color: '#2B4628', marginBottom: '1rem' }} />
            <h3>All caught up!</h3>
            <p>You have no pending expense approvals at this time</p>
          </div>
        ) : (
          <div className="approval-list">
            {pendingApprovals.map((item) => (
              <div key={item.expense_id} className="approval-item">
                {/* Header */}
                <div className="approval-header" onClick={() => toggleExpanded(item.expense_id)}>
                  <div className="approval-main-info">
                    <div className="approval-submitter">
                      <User size={16} />
                      <strong>{item.submitted_by}</strong>
                    </div>
                    
                    <div className="approval-description">
                      {item.description}
                    </div>

                    <div className="approval-meta">
                      <span className="badge badge-info">{item.category}</span>
                      <span className="approval-date">
                        <Calendar size={14} />
                        {formatDate(item.date)}
                      </span>
                      <span className="approval-submitter-id">
                        Emp ID: {item.submitter_employee_id}
                      </span>
                    </div>
                  </div>

                  <div className="approval-amount-section">
                    <div className="approval-amount">
                      {formatCurrency(item.amount)}
                    </div>
                    <button 
                      type="button"
                      className="expand-toggle"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpanded(item.expense_id);
                      }}
                    >
                      {expandedExpense === item.expense_id ? (
                        <ChevronUp size={20} />
                      ) : (
                        <ChevronDown size={20} />
                      )}
                    </button>
                  </div>
                </div>

                {/* Expanded Details */}
                {expandedExpense === item.expense_id && (
                  <div className="approval-details">
                    <div className="approval-details-grid">
                      <div className="detail-item">
                        <label>Vendor</label>
                        <span>{item.vendor_name || 'N/A'}</span>
                      </div>
                      <div className="detail-item">
                        <label>Cost Center</label>
                        <span>{item.cost_center_code} - {item.cost_center_name}</span>
                      </div>
                      <div className="detail-item">
                        <label>Location</label>
                        <span>{item.location_code ? `${item.location_code} - ${item.location_name}` : 'N/A'}</span>
                      </div>
                      <div className="detail-item">
                        <label>Cost Type</label>
                        <span className={`badge ${item.cost_type === 'CAPEX' ? 'badge-warning' : 'badge-info'}`}>
                          {item.cost_type}
                        </span>
                      </div>
                      <div className="detail-item">
                        <label>Status</label>
                        <StatusBadge status={item.status} />
                      </div>
                      {item.notes && (
                        <div className="detail-item" style={{ gridColumn: '1 / -1' }}>
                          <label>Notes</label>
                          <span>{item.notes}</span>
                        </div>
                      )}
                    </div>

                    {/* Comments/Actions */}
                    <div className="approval-actions">
                      <div className="form-group">
                        <label className="form-label">
                          <MessageSquare size={16} />
                          Comments (optional for approval, required for rejection)
                        </label>
                        <textarea
                          value={comments[item.expense_id] || ''}
                          onChange={(e) => setComments({
                            ...comments,
                            [item.expense_id]: e.target.value
                          })}
                          placeholder="Add comments about this expense..."
                          className="form-input"
                          rows="3"
                          disabled={actioningId === item.expense_id}
                        />
                      </div>

                      <div className="action-buttons">
                        <button
                          onClick={() => handleReject(item.expense_id)}
                          className="btn btn-danger"
                          disabled={actioningId === item.expense_id}
                        >
                          {actioningId === item.expense_id ? (
                            <>
                              <span className="btn-spinner"></span>
                              Rejecting...
                            </>
                          ) : (
                            <>
                              <XCircle size={18} />
                              Reject
                            </>
                          )}
                        </button>

                        <button
                          onClick={() => handleApprove(item.expense_id)}
                          className="btn btn-primary"
                          disabled={actioningId === item.expense_id}
                        >
                          {actioningId === item.expense_id ? (
                            <>
                              <span className="btn-spinner"></span>
                              Approving...
                            </>
                          ) : (
                            <>
                              <CheckCircle size={18} />
                              Approve
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 1.5rem;
        }

        .stat-card {
          display: flex;
          gap: 1rem;
          padding: 1.5rem;
          background: white;
          border-radius: 8px;
          border: 1px solid #e5e7eb;
        }

        .stat-icon {
          width: 48px;
          height: 48px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .stat-content {
          display: flex;
          flex-direction: column;
          justify-content: center;
        }

        .stat-value {
          font-size: 1.5rem;
          font-weight: 700;
          color: #111827;
        }

        .stat-label {
          font-size: 0.875rem;
          color: #6b7280;
        }

        .approval-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .approval-item {
          border: 2px solid #e5e7eb;
          border-radius: 8px;
          background: white;
          overflow: hidden;
          transition: all 0.2s;
        }

        .approval-item:hover {
          border-color: #BCD7DE;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .approval-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1.5rem;
          cursor: pointer;
        }

        .approval-main-info {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .approval-submitter {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: #111827;
        }

        .approval-description {
          font-size: 1rem;
          color: #374151;
        }

        .approval-meta {
          display: flex;
          align-items: center;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .approval-date {
          display: flex;
          align-items: center;
          gap: 0.375rem;
          color: #6b7280;
          font-size: 0.875rem;
        }

        .approval-level {
          font-size: 0.875rem;
          color: #2B4628;
          font-weight: 600;
        }

        .approval-submitter-id {
          font-size: 0.875rem;
          color: #6b7280;
        }

        .approval-amount-section {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .approval-amount {
          font-size: 1.5rem;
          font-weight: 700;
          color: #2B4628;
        }

        .expand-toggle {
          background: #f3f4f6;
          border: none;
          border-radius: 6px;
          padding: 0.5rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }

        .expand-toggle:hover {
          background: #e5e7eb;
        }

        .approval-details {
          padding: 0 1.5rem 1.5rem;
          border-top: 1px solid #e5e7eb;
          padding-top: 1.5rem;
        }

        .approval-details-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1rem;
          margin-bottom: 1.5rem;
        }

        .detail-item {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .detail-item label {
          font-size: 0.75rem;
          font-weight: 600;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .detail-item span {
          font-size: 0.875rem;
          color: #111827;
        }

        .approval-flow-info {
          margin-bottom: 1.5rem;
          padding: 1rem;
          background: #f9fafb;
          border-radius: 6px;
        }

        .approval-flow-label {
          font-size: 0.875rem;
          font-weight: 600;
          color: #6b7280;
          margin-bottom: 1rem;
        }

        .approval-progress {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .approval-step-indicator {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.25rem;
          padding: 0.75rem 1rem;
          background: white;
          border: 2px solid #e5e7eb;
          border-radius: 6px;
          min-width: 120px;
        }

        .approval-step-indicator.approved {
          border-color: #2B4628;
          background: #f3f6f2;
        }

        .approval-step-indicator.current {
          border-color: #BCD7DE;
          background: #f0f8fa;
        }

        .step-number {
          font-size: 0.75rem;
          font-weight: 600;
          color: #6b7280;
        }

        .step-approver {
          font-size: 0.875rem;
          font-weight: 600;
          color: #111827;
        }

        .step-icon {
          color: #2B4628;
          margin-top: 0.25rem;
        }

        .approval-arrow {
          color: #9ca3af;
          font-size: 1.25rem;
        }

        .approval-actions {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .action-buttons {
          display: flex;
          justify-content: flex-end;
          gap: 1rem;
        }

        .loading-spinner {
          display: inline-block;
          width: 20px;
          height: 20px;
          border: 3px solid #f3f4f6;
          border-top-color: #2B4628;
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
          margin-right: 0.5rem;
        }

        .btn-spinner {
          display: inline-block;
          width: 14px;
          height: 14px;
          border: 2px solid currentColor;
          border-top-color: transparent;
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
          margin-right: 0.5rem;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        @media (max-width: 768px) {
          .approval-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 1rem;
          }

          .approval-amount-section {
            width: 100%;
            justify-content: space-between;
          }

          .action-buttons {
            flex-direction: column;
          }

          .action-buttons .btn {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
};

export default Approvals;
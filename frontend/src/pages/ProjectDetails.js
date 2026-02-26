import React, { useState, useEffect } from 'react';
import {
  ArrowLeft, Calendar, DollarSign, User, Clock, CheckCircle,
  XCircle, Trash2, FileText, TrendingUp, TrendingDown, Plus
} from 'lucide-react';
import api from '../services/api';
import { useToast } from '../components/Toast';

const ProjectDetails = () => {
  // Parse project ID from hash (format: #project-details/123)
  const getProjectId = () => {
    const hash = window.location.hash;
    const match = hash.match(/#project-details\/(\d+)/);
    return match ? match[1] : null;
  };

  const [id, setId] = useState(getProjectId());
  const toast = useToast();
  const [project, setProject] = useState(null);
  const [stats, setStats] = useState(null);
  const [wbsElements, setWbsElements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isManager, setIsManager] = useState(false);

  useEffect(() => {
    fetchProjectDetails();
    fetchProjectStats();
    fetchWbsElements();
    checkUserRole();
  }, [id]);

  const checkUserRole = () => {
    const userStr = localStorage.getItem('user');
    const user = userStr ? JSON.parse(userStr) : null;
    const userRole = user?.role || 'employee';
    setIsManager(['manager', 'admin', 'developer'].includes(userRole));
  };

  const fetchProjectDetails = async () => {
    try {
      const response = await api.get(`/projects/${id}`);
      setProject(response.data);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching project:', err);
      toast.error('Failed to load project details');
      setLoading(false);
    }
  };

  const fetchProjectStats = async () => {
    try {
      const response = await api.get(`/projects/${id}/stats`);
      setStats(response.data);
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  };

  const fetchWbsElements = async () => {
    try {
      const response = await api.get(`/projects/${id}/wbs`);
      setWbsElements(response.data);
    } catch (err) {
      console.error('Error fetching WBS elements:', err);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete project "${project.name}"? This cannot be undone.`)) {
      return;
    }

    try {
      await api.delete(`/projects/${id}`);
      toast.success('Project deleted successfully');
      window.location.hash = '#projects';
    } catch (err) {
      console.error('Error deleting project:', err);
      toast.error(err.response?.data?.error || 'Failed to delete project');
    }
  };

  const handleApprove = async () => {
    try {
      await api.post(`/projects/${id}/approve`);
      toast.success('Project approved successfully');
      fetchProjectDetails();
    } catch (err) {
      console.error('Error approving project:', err);
      toast.error(err.response?.data?.error || 'Failed to approve project');
    }
  };

  const handleReject = async () => {
    const reason = window.prompt('Please provide a reason for rejection:');
    if (!reason || reason.trim() === '') {
      toast.error('Rejection reason is required');
      return;
    }

    try {
      await api.post(`/projects/${id}/reject`, { reason });
      toast.success('Project rejected');
      fetchProjectDetails();
    } catch (err) {
      console.error('Error rejecting project:', err);
      toast.error(err.response?.data?.error || 'Failed to reject project');
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      pending: { color: '#f59e0b', bg: '#fef3c7', icon: Clock },
      approved: { color: '#2B4628', bg: '#e3e9e1', icon: CheckCircle },
      rejected: { color: '#ef4444', bg: '#fee2e2', icon: XCircle }
    };

    const config = statusConfig[status] || statusConfig.pending;
    const Icon = config.icon;

    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.5rem 1rem',
        borderRadius: '9999px',
        backgroundColor: config.bg,
        color: config.color,
        fontSize: '0.875rem',
        fontWeight: '600'
      }}>
        <Icon size={16} />
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="container">
        <div className="loading-spinner"></div>
        Loading project details...
      </div>
    );
  }

  if (!project) {
    return (
      <div className="container">
        <div className="empty-state">
          <h3>Project not found</h3>
          <button onClick={() => window.location.hash = '#projects'} className="btn-primary">
            Back to Projects
          </button>
        </div>
      </div>
    );
  }

  const budgetUsedPercent = stats?.percent_used || 0;
  const isOverBudget = budgetUsedPercent > 100;

  return (
    <div className="container">
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <button
          onClick={() => window.location.hash = '#projects'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 1rem',
            border: '1px solid #e5e7eb',
            borderRadius: '0.5rem',
            background: 'white',
            cursor: 'pointer',
            marginBottom: '1rem'
          }}
        >
          <ArrowLeft size={16} />
          Back to Projects
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
              <h2 className="page-title" style={{ margin: 0 }}>{project.name}</h2>
              {getStatusBadge(project.status)}
            </div>
            <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
              Project Code: <strong>{project.code}</strong>
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {project.status === 'approved' && (
              <button
                onClick={() => window.location.hash = `#expenses-submit?projectId=${id}`}
                className="btn-primary"
              >
                <Plus size={16} />
                Create Expense
              </button>
            )}
            {isManager && (
              <>
                {project.status === 'pending' && (
                  <>
                    <button onClick={handleApprove} className="btn-primary">
                      <CheckCircle size={16} />
                      Approve
                    </button>
                    <button onClick={handleReject} className="btn-secondary">
                      <XCircle size={16} />
                      Reject
                    </button>
                  </>
                )}
                <button
                  onClick={handleDelete}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem 1rem',
                    border: '1px solid #ef4444',
                    borderRadius: '0.5rem',
                    background: 'white',
                    color: '#ef4444',
                    cursor: 'pointer'
                  }}
                >
                  <Trash2 size={16} />
                  Delete
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Budget Stats */}
      {stats && project.budget && (
        <div className="card" style={{ marginBottom: '2rem' }}>
          <h3 style={{ marginBottom: '1rem' }}>Budget Overview</h3>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon" style={{ background: '#e3e9e1', color: '#2B4628' }}>
                <DollarSign size={24} />
              </div>
              <div className="stat-content">
                <div className="stat-value">{formatCurrency(project.budget)}</div>
                <div className="stat-label">Total Budget</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon" style={{ background: isOverBudget ? '#fee2e2' : '#e3e9e1', color: isOverBudget ? '#ef4444' : '#2B4628' }}>
                {isOverBudget ? <TrendingDown size={24} /> : <TrendingUp size={24} />}
              </div>
              <div className="stat-content">
                <div className="stat-value">{formatCurrency(stats.total_spent)}</div>
                <div className="stat-label">Total Spent ({budgetUsedPercent}%)</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon" style={{ background: '#F2ECD4', color: '#5a7353' }}>
                <DollarSign size={24} />
              </div>
              <div className="stat-content">
                <div className="stat-value">{formatCurrency(Math.max(0, stats.remaining))}</div>
                <div className="stat-label">{isOverBudget ? 'Over Budget' : 'Remaining'}</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon" style={{ background: '#f0f8fa', color: '#a0c5ce' }}>
                <FileText size={24} />
              </div>
              <div className="stat-content">
                <div className="stat-value">{stats.expense_count}</div>
                <div className="stat-label">Expenses</div>
              </div>
            </div>
          </div>

          {/* Budget Progress Bar */}
          <div style={{ marginTop: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>Budget Used</span>
              <span style={{ fontSize: '0.875rem', fontWeight: '600', color: isOverBudget ? '#ef4444' : '#6b7280' }}>
                {budgetUsedPercent}%
              </span>
            </div>
            <div style={{
              width: '100%',
              height: '0.5rem',
              background: '#f3f4f6',
              borderRadius: '9999px',
              overflow: 'hidden'
            }}>
              <div style={{
                width: `${Math.min(100, budgetUsedPercent)}%`,
                height: '100%',
                background: isOverBudget ? '#ef4444' : '#2B4628',
                transition: 'width 0.3s ease'
              }}></div>
            </div>
          </div>
        </div>
      )}

      {/* WBS Elements - Budget Breakdown */}
      {wbsElements.length > 0 && (
        <div className="card" style={{ marginBottom: '2rem' }}>
          <h3 style={{ marginBottom: '1rem' }}>Budget Breakdown by Category (WBS Elements)</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {wbsElements.map((wbs) => {
              const budgetEstimate = parseFloat(wbs.budget_estimate);
              const totalSpent = parseFloat(wbs.total_spent) || 0;
              const remaining = budgetEstimate - totalSpent;
              const percentUsed = budgetEstimate > 0 ? ((totalSpent / budgetEstimate) * 100).toFixed(1) : 0;
              const isOverBudget = percentUsed > 100;

              return (
                <div key={wbs.id} style={{
                  padding: '1rem',
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.5rem',
                  background: 'white'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: '600' }}>{wbs.category}</h4>
                      <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: '#6b7280' }}>
                        Code: <strong>{wbs.code}</strong>
                      </p>
                      {wbs.description && (
                        <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: '#9ca3af' }}>
                          {wbs.description}
                        </p>
                      )}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '1.25rem', fontWeight: '600', color: isOverBudget ? '#ef4444' : '#2B4628' }}>
                        {formatCurrency(totalSpent)}
                      </div>
                      <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                        of {formatCurrency(budgetEstimate)}
                      </div>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div style={{ marginTop: '0.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                      <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                        {wbs.expense_count} expense{wbs.expense_count !== 1 ? 's' : ''}
                      </span>
                      <span style={{ fontSize: '0.75rem', fontWeight: '600', color: isOverBudget ? '#ef4444' : '#6b7280' }}>
                        {percentUsed}% used • {formatCurrency(remaining)} {isOverBudget ? 'over' : 'remaining'}
                      </span>
                    </div>
                    <div style={{
                      width: '100%',
                      height: '0.5rem',
                      background: '#f3f4f6',
                      borderRadius: '9999px',
                      overflow: 'hidden'
                    }}>
                      <div style={{
                        width: `${Math.min(100, percentUsed)}%`,
                        height: '100%',
                        background: isOverBudget ? '#ef4444' : '#2B4628',
                        transition: 'width 0.3s ease'
                      }}></div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Project Details */}
      <div className="card" style={{ marginBottom: '2rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>Project Details</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          <div>
            <label style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem', display: 'block' }}>
              Description
            </label>
            <p>{project.description || 'No description provided'}</p>
          </div>

          <div>
            <label style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem', display: 'block' }}>
              Project Manager
            </label>
            <p>{project.project_manager || 'Not assigned'}</p>
          </div>

          <div>
            <label style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem', display: 'block' }}>
              <Calendar size={14} style={{ display: 'inline', marginRight: '0.25rem' }} />
              Start Date
            </label>
            <p>{formatDate(project.start_date)}</p>
          </div>

          <div>
            <label style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem', display: 'block' }}>
              <Calendar size={14} style={{ display: 'inline', marginRight: '0.25rem' }} />
              End Date
            </label>
            <p>{formatDate(project.end_date)}</p>
          </div>

          <div>
            <label style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem', display: 'block' }}>
              <User size={14} style={{ display: 'inline', marginRight: '0.25rem' }} />
              Submitted By
            </label>
            <p>{project.submitted_by_name || 'Unknown'} ({project.submitted_by_email})</p>
          </div>

          <div>
            <label style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem', display: 'block' }}>
              <Clock size={14} style={{ display: 'inline', marginRight: '0.25rem' }} />
              Created
            </label>
            <p>{formatDate(project.created_at)}</p>
          </div>

          {project.approved_by_name && (
            <>
              <div>
                <label style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem', display: 'block' }}>
                  {project.status === 'approved' ? 'Approved By' : 'Rejected By'}
                </label>
                <p>{project.approved_by_name}</p>
              </div>

              <div>
                <label style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem', display: 'block' }}>
                  {project.status === 'approved' ? 'Approved At' : 'Rejected At'}
                </label>
                <p>{formatDate(project.approved_at)}</p>
              </div>
            </>
          )}

          {project.rejection_reason && (
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem', display: 'block' }}>
                Rejection Reason
              </label>
              <div style={{
                padding: '1rem',
                background: '#fee2e2',
                border: '1px solid #ef4444',
                borderRadius: '0.5rem',
                color: '#991b1b'
              }}>
                {project.rejection_reason}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProjectDetails;

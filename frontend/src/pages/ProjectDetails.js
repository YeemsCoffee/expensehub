import React, { useState, useEffect } from 'react';
import {
  ArrowLeft, Calendar, DollarSign, User, Clock, CheckCircle,
  XCircle, Trash2, FileText, TrendingUp, TrendingDown, Plus,
  Eye, Download, X, Filter, Upload, Paperclip
} from 'lucide-react';
import api from '../services/api';
import { useToast } from '../components/Toast';
import StatusBadge from '../components/StatusBadge';

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
  const [phases, setPhases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isManager, setIsManager] = useState(false);
  const [isAdminOrDeveloper, setIsAdminOrDeveloper] = useState(false);

  // Expense modal state
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [selectedWbs, setSelectedWbs] = useState(null);
  const [wbsExpenses, setWbsExpenses] = useState([]);
  const [expensesSummary, setExpensesSummary] = useState(null);
  const [loadingExpenses, setLoadingExpenses] = useState(false);

  // Budget increase modal state
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [budgetIncreaseAmount, setBudgetIncreaseAmount] = useState('');
  const [budgetIncreaseReason, setBudgetIncreaseReason] = useState('');
  const [selectedWbsForBudget, setSelectedWbsForBudget] = useState(null);

  // Documents state
  const [documents, setDocuments] = useState([]);
  const [showDocumentUpload, setShowDocumentUpload] = useState(false);
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [documentName, setDocumentName] = useState('');
  const [documentDescription, setDocumentDescription] = useState('');

  // Phase change state
  const [changingPhase, setChangingPhase] = useState(false);

  // Listen for hash changes to update project ID
  useEffect(() => {
    const handleHashChange = () => {
      const newId = getProjectId();
      if (newId !== id) {
        setId(newId);
        setLoading(true);
        setProject(null);
        setStats(null);
        setWbsElements([]);
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [id]);

  useEffect(() => {
    if (id) {
      fetchProjectDetails();
      fetchProjectStats();
      fetchWbsElements();
      fetchPhases();
      fetchDocuments();
      checkUserRole();
    }
  }, [id]);

  const checkUserRole = () => {
    const userStr = localStorage.getItem('user');
    const user = userStr ? JSON.parse(userStr) : null;
    const userRole = user?.role || 'employee';
    setIsManager(['manager', 'admin', 'developer'].includes(userRole));
    setIsAdminOrDeveloper(['admin', 'developer'].includes(userRole));
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

  const fetchPhases = async () => {
    try {
      const response = await api.get(`/project-phases/${id}`);
      setPhases(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      console.error('Error fetching phases:', err);
      setPhases([]);
    }
  };

  const fetchWbsExpenses = async (wbsId) => {
    setLoadingExpenses(true);
    try {
      const response = await api.get(`/projects/${id}/wbs/${wbsId}/expenses`);
      setWbsExpenses(response.data.expenses);
      setExpensesSummary(response.data.summary);
      setSelectedWbs(response.data.wbsElement);
      setShowExpenseModal(true);
    } catch (err) {
      console.error('Error fetching WBS expenses:', err);
      toast.error('Failed to load expenses');
    } finally {
      setLoadingExpenses(false);
    }
  };

  const openBudgetIncreaseModal = (wbs) => {
    setSelectedWbsForBudget(wbs);
    setBudgetIncreaseAmount('');
    setBudgetIncreaseReason('');
    setShowBudgetModal(true);
  };

  const handleBudgetIncrease = async () => {
    if (!budgetIncreaseAmount || parseFloat(budgetIncreaseAmount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    if (!budgetIncreaseReason.trim()) {
      toast.error('Please provide a reason for the budget increase');
      return;
    }

    try {
      const response = await api.patch(
        `/projects/${id}/wbs/${selectedWbsForBudget.id}/increase-budget`,
        {
          amount: parseFloat(budgetIncreaseAmount),
          reason: budgetIncreaseReason
        }
      );

      toast.success(`Budget increased by ${formatCurrency(parseFloat(budgetIncreaseAmount))}`);
      setShowBudgetModal(false);
      // Refresh WBS elements to show updated budget
      fetchWbsElements();
    } catch (err) {
      console.error('Error increasing budget:', err);
      toast.error(err.response?.data?.error || 'Failed to increase budget');
    }
  };

  // Document Management Functions
  const fetchDocuments = async () => {
    try {
      const response = await api.get(`/project-documents/project/${id}`);
      setDocuments(response.data || []);
    } catch (err) {
      console.error('Error fetching documents:', err);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      if (!documentName) {
        setDocumentName(file.name);
      }
    }
  };

  const handleDocumentUpload = async () => {
    if (!selectedFile) {
      toast.error('Please select a file');
      return;
    }
    if (!documentName.trim()) {
      toast.error('Please enter a document name');
      return;
    }

    setUploadingDocument(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('project_id', id);
      formData.append('document_name', documentName);
      formData.append('document_type', 'general');
      formData.append('document_category', 'Planning');
      formData.append('version', '1.0');
      formData.append('description', documentDescription);

      await api.post('/project-documents/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      toast.success('Document uploaded successfully');
      setShowDocumentUpload(false);
      setSelectedFile(null);
      setDocumentName('');
      setDocumentDescription('');
      fetchDocuments();
    } catch (err) {
      console.error('Error uploading document:', err);
      toast.error(err.response?.data?.error || 'Failed to upload document');
    } finally {
      setUploadingDocument(false);
    }
  };

  const handleDocumentDelete = async (docId) => {
    if (!window.confirm('Are you sure you want to delete this document?')) {
      return;
    }

    try {
      await api.delete(`/project-documents/${docId}`);
      toast.success('Document deleted successfully');
      fetchDocuments();
    } catch (err) {
      console.error('Error deleting document:', err);
      toast.error('Failed to delete document');
    }
  };

  const downloadReport = async (format = 'csv') => {
    try {
      const response = await api.get(`/projects/${id}/report`, {
        params: { format },
        responseType: format === 'csv' ? 'blob' : 'json'
      });

      if (format === 'csv') {
        // Create download link for CSV
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `project-${project.code}-report-${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        toast.success('Report downloaded successfully');
      } else {
        // Handle JSON format - could open in new tab or display
        console.log('Report data:', response.data);
        toast.success('Report generated successfully');
      }
    } catch (err) {
      console.error('Error downloading report:', err);
      toast.error('Failed to download report');
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

  const handlePhaseChange = async (newPhaseId) => {
    if (!window.confirm('Are you sure you want to change the current project phase?')) {
      return;
    }

    setChangingPhase(true);
    try {
      await api.post(`/project-phases/${id}/set-current/${newPhaseId}`);
      toast.success('Project phase updated successfully');
      fetchProjectDetails();
      fetchPhases();
    } catch (err) {
      console.error('Error changing phase:', err);
      toast.error(err.response?.data?.error || 'Failed to change project phase');
    } finally {
      setChangingPhase(false);
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
            {isManager && (
              <button
                onClick={() => downloadReport('csv')}
                className="btn-secondary"
                style={{
                  fontSize: '0.95rem',
                  fontWeight: '500',
                  padding: '0.65rem 1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  borderRadius: '0.5rem'
                }}
              >
                <Download size={18} />
                Export Report
              </button>
            )}
            {project.status === 'approved' && (
              <button
                onClick={() => window.location.hash = `#project-expense-submit?projectId=${id}`}
                className="btn-primary"
                style={{
                  fontSize: '0.95rem',
                  fontWeight: '500',
                  padding: '0.65rem 1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  boxShadow: '0 2px 8px rgba(43, 70, 40, 0.15)',
                  transition: 'all 0.2s ease',
                  color: '#F2ECD4',
                  borderRadius: '0.5rem'
                }}
              >
                <Plus size={18} />
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

      {/* Phases & Gates - Project Progress */}
      {phases && phases.length > 0 && (
        <div className="card" style={{ marginBottom: '2rem' }}>
          <h3 style={{ marginBottom: '1rem' }}>Project Phases & Gates</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            {phases.map((phase, index) => {
              const isCurrent = project.current_phase_id && phase.id === project.current_phase_id;
              const isCompleted = phase.status === 'completed';
              const isActive = phase.status === 'active';
              const isPending = phase.status === 'not_started';

              return (
                <div
                  key={phase.id}
                  style={{
                    padding: '1rem',
                    border: `2px solid ${isCurrent ? '#2B4628' : isCompleted ? '#10b981' : isActive ? '#3b82f6' : '#e5e7eb'}`,
                    borderRadius: '0.5rem',
                    background: isCurrent ? '#F2ECD4' : isCompleted ? '#f0fdf4' : isActive ? '#eff6ff' : 'white',
                    position: 'relative'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: '0.75rem',
                      fontWeight: '600',
                      color: '#6b7280',
                      background: '#f3f4f6',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '0.25rem'
                    }}>
                      Phase {phase.sequence_order}
                    </span>
                    {isCurrent && (
                      <span style={{
                        fontSize: '0.65rem',
                        fontWeight: '700',
                        color: '#2B4628',
                        background: 'white',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '0.25rem',
                        border: '1px solid #2B4628'
                      }}>
                        CURRENT
                      </span>
                    )}
                    {isCompleted && <CheckCircle size={16} color="#10b981" />}
                    {isActive && <Clock size={16} color="#3b82f6" />}
                  </div>
                  <h4 style={{ fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                    {phase.name}
                  </h4>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    {phase.gate_approval_required && (
                      <div style={{ marginTop: '0.5rem' }}>
                        {phase.gate_decision ? (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            color: phase.gate_decision === 'approved' ? '#10b981' : '#ef4444',
                            fontSize: '0.75rem',
                            fontWeight: '600'
                          }}>
                            {phase.gate_decision === 'approved' ? <CheckCircle size={12} /> : <XCircle size={12} />}
                            Gate {phase.gate_decision}
                          </span>
                        ) : (
                          <span style={{ color: '#f59e0b', fontSize: '0.75rem', fontWeight: '600' }}>
                            Gate Pending
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Phase Selector - Manager/Admin Only */}
          {isManager && project.status === 'approved' && phases.length > 0 && (
            <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #e5e7eb' }}>
              <label style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: '600',
                color: '#374151',
                marginBottom: '0.5rem'
              }}>
                Change Current Phase:
              </label>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <select
                  value={project.current_phase_id || ''}
                  onChange={(e) => handlePhaseChange(parseInt(e.target.value))}
                  disabled={changingPhase}
                  style={{
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem',
                    minWidth: '200px',
                    cursor: changingPhase ? 'not-allowed' : 'pointer'
                  }}
                >
                  <option value="">Select phase...</option>
                  {phases.map(phase => (
                    <option key={phase.id} value={phase.id}>
                      Phase {phase.sequence_order}: {phase.name}
                      {phase.gate_approval_required && !phase.gate_decision ? ' (Gate Pending)' : ''}
                    </option>
                  ))}
                </select>
                {changingPhase && <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>Updating...</span>}
              </div>
              <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                Current: {project.current_phase_name || 'None'}
              </p>
            </div>
          )}
        </div>
      )}

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
                    <div style={{ flex: 1 }}>
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '1.25rem', fontWeight: '600', color: isOverBudget ? '#ef4444' : '#2B4628' }}>
                          {formatCurrency(totalSpent)}
                        </div>
                        <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                          of {formatCurrency(budgetEstimate)}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {isManager && wbs.expense_count > 0 && (
                          <button
                            onClick={() => fetchWbsExpenses(wbs.id)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem',
                              padding: '0.5rem 1rem',
                              border: '1px solid #2B4628',
                              borderRadius: '0.5rem',
                              background: 'white',
                              color: '#2B4628',
                              cursor: 'pointer',
                              fontSize: '0.875rem'
                            }}
                          >
                            <Eye size={16} />
                            View Expenses
                          </button>
                        )}
                        {isAdminOrDeveloper && (
                          <button
                            onClick={() => openBudgetIncreaseModal(wbs)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem',
                              padding: '0.5rem 1rem',
                              border: '1px solid #3b82f6',
                              borderRadius: '0.5rem',
                              background: 'white',
                              color: '#3b82f6',
                              cursor: 'pointer',
                              fontSize: '0.875rem'
                            }}
                          >
                            <TrendingUp size={16} />
                            Increase Budget
                          </button>
                        )}
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

          {project.current_phase_name && (
            <>
              <div>
                <label style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem', display: 'block' }}>
                  Current Phase
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontWeight: '600' }}>{project.current_phase_name}</span>
                  {project.current_phase_status && (
                    <span style={{
                      padding: '0.25rem 0.5rem',
                      borderRadius: '0.25rem',
                      fontSize: '0.75rem',
                      fontWeight: '500',
                      background: project.current_phase_status === 'completed' ? '#f0fdf4' : project.current_phase_status === 'in_progress' ? '#eff6ff' : '#f3f4f6',
                      color: project.current_phase_status === 'completed' ? '#10b981' : project.current_phase_status === 'in_progress' ? '#3b82f6' : '#6b7280'
                    }}>
                      {project.current_phase_status.replace(/_/g, ' ')}
                    </span>
                  )}
                </div>
              </div>

              {project.current_phase_gate_required && (
                <div>
                  <label style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem', display: 'block' }}>
                    Gate Status
                  </label>
                  {project.current_phase_gate_decision ? (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '0.25rem',
                      fontSize: '0.875rem',
                      fontWeight: '600',
                      background: project.current_phase_gate_decision === 'approved' ? '#f0fdf4' : '#fee2e2',
                      color: project.current_phase_gate_decision === 'approved' ? '#10b981' : '#ef4444'
                    }}>
                      {project.current_phase_gate_decision === 'approved' ? <CheckCircle size={14} /> : <XCircle size={14} />}
                      Gate {project.current_phase_gate_decision}
                    </span>
                  ) : (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '0.25rem',
                      fontSize: '0.875rem',
                      fontWeight: '600',
                      background: '#fef3c7',
                      color: '#f59e0b'
                    }}>
                      <Clock size={14} />
                      Gate Pending Approval
                    </span>
                  )}
                </div>
              )}
            </>
          )}

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

      {/* Project Documents */}
      <div className="card" style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h3 style={{ margin: 0 }}>Project Documents</h3>
          <button
            onClick={() => setShowDocumentUpload(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 1rem',
              border: 'none',
              borderRadius: '0.5rem',
              background: '#2B4628',
              color: 'white',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500'
            }}
          >
            <Upload size={16} />
            Upload Document
          </button>
        </div>

        {documents.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '3rem',
            color: '#6b7280',
            background: '#f9fafb',
            borderRadius: '0.5rem'
          }}>
            <Paperclip size={48} style={{ margin: '0 auto 1rem', opacity: 0.3 }} />
            <p style={{ margin: 0, fontSize: '0.875rem' }}>No documents uploaded yet</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {documents.map(doc => (
              <div
                key={doc.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '1rem',
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.5rem',
                  background: 'white'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
                  <FileText size={20} color="#2B4628" />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: '500', marginBottom: '0.25rem' }}>{doc.document_name}</div>
                    {doc.description && (
                      <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>{doc.description}</div>
                    )}
                    <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>
                      Uploaded {new Date(doc.created_at).toLocaleDateString()} by {doc.uploaded_by_name || 'Unknown'}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <a
                    href={`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/uploads/documents/${doc.file_path}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.5rem 1rem',
                      border: '1px solid #2B4628',
                      borderRadius: '0.375rem',
                      background: 'white',
                      color: '#2B4628',
                      textDecoration: 'none',
                      fontSize: '0.875rem',
                      fontWeight: '500'
                    }}
                  >
                    <Download size={14} />
                    Download
                  </a>
                  {(isManager || isAdminOrDeveloper) && (
                    <button
                      onClick={() => handleDocumentDelete(doc.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.5rem 1rem',
                        border: '1px solid #ef4444',
                        borderRadius: '0.375rem',
                        background: 'white',
                        color: '#ef4444',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        fontWeight: '500'
                      }}
                    >
                      <Trash2 size={14} />
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Document Upload Modal */}
      {showDocumentUpload && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            borderRadius: '0.5rem',
            padding: '2rem',
            width: '90%',
            maxWidth: '500px',
            maxHeight: '90vh',
            overflow: 'auto'
          }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0, marginBottom: '1.5rem' }}>Upload Document</h3>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Select File *
              </label>
              <input
                type="file"
                onChange={handleFileSelect}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.375rem'
                }}
              />
              {selectedFile && (
                <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#6b7280' }}>
                  Selected: {selectedFile.name}
                </p>
              )}
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Document Name *
              </label>
              <input
                type="text"
                value={documentName}
                onChange={(e) => setDocumentName(e.target.value)}
                placeholder="Enter document name"
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.375rem'
                }}
              />
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Description
              </label>
              <textarea
                value={documentDescription}
                onChange={(e) => setDocumentDescription(e.target.value)}
                placeholder="Enter description (optional)"
                rows={3}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.375rem',
                  resize: 'vertical'
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowDocumentUpload(false);
                  setSelectedFile(null);
                  setDocumentName('');
                  setDocumentDescription('');
                }}
                style={{
                  padding: '0.625rem 1.25rem',
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.375rem',
                  background: 'white',
                  color: '#6b7280',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDocumentUpload}
                disabled={uploadingDocument || !selectedFile || !documentName.trim()}
                style={{
                  padding: '0.625rem 1.25rem',
                  border: 'none',
                  borderRadius: '0.375rem',
                  background: uploadingDocument || !selectedFile || !documentName.trim() ? '#d1d5db' : '#2B4628',
                  color: 'white',
                  cursor: uploadingDocument || !selectedFile || !documentName.trim() ? 'not-allowed' : 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                {uploadingDocument ? (
                  <>Uploading...</>
                ) : (
                  <>
                    <Upload size={14} />
                    Upload
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Expense Modal */}
      {showExpenseModal && selectedWbs && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '2rem'
        }}>
          <div style={{
            background: 'white',
            borderRadius: '0.5rem',
            maxWidth: '1200px',
            width: '100%',
            maxHeight: '90vh',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '1.5rem',
              borderBottom: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '600' }}>
                  Expenses for {selectedWbs.category}
                </h3>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: '#6b7280' }}>
                  WBS Code: <strong>{selectedWbs.code}</strong>
                </p>
              </div>
              <button
                onClick={() => setShowExpenseModal(false)}
                style={{
                  padding: '0.5rem',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  borderRadius: '0.25rem'
                }}
              >
                <X size={24} />
              </button>
            </div>

            {/* Summary Stats */}
            {expensesSummary && (
              <div style={{
                padding: '1rem 1.5rem',
                background: '#f9fafb',
                borderBottom: '1px solid #e5e7eb'
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', fontSize: '0.875rem' }}>
                  <div>
                    <span style={{ color: '#6b7280' }}>Total: </span>
                    <strong>{formatCurrency(expensesSummary.total_amount)}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#f59e0b' }}>Pending: </span>
                    <strong>{formatCurrency(expensesSummary.pending_amount)}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#2B4628' }}>Approved: </span>
                    <strong>{formatCurrency(expensesSummary.approved_amount)}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#6b7280' }}>Count: </span>
                    <strong>{expensesSummary.total_count} expense{expensesSummary.total_count !== '1' ? 's' : ''}</strong>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', fontSize: '0.875rem', marginTop: '0.5rem' }}>
                  <div>
                    <span style={{ color: '#6b7280' }}>OPEX: </span>
                    <strong>{formatCurrency(expensesSummary.opex_amount)}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#6b7280' }}>CAPEX: </span>
                    <strong>{formatCurrency(expensesSummary.capex_amount)}</strong>
                  </div>
                </div>
              </div>
            )}

            {/* Expenses Table */}
            <div style={{ flex: 1, overflow: 'auto', padding: '1.5rem' }}>
              {loadingExpenses ? (
                <div style={{ textAlign: 'center', padding: '2rem' }}>
                  <div className="loading-spinner"></div>
                  Loading expenses...
                </div>
              ) : wbsExpenses.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                  No expenses found for this WBS element
                </div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Description</th>
                      <th>Submitted By</th>
                      <th>Category</th>
                      <th>Amount</th>
                      <th>Cost Type</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {wbsExpenses.map((expense) => (
                      <tr key={expense.id}>
                        <td>{formatDate(expense.date)}</td>
                        <td>
                          <div style={{ maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {expense.description}
                          </div>
                        </td>
                        <td>
                          <div>
                            <div style={{ fontWeight: '500' }}>{expense.submitted_by_name}</div>
                            <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{expense.submitted_by_email}</div>
                          </div>
                        </td>
                        <td>
                          <span style={{
                            padding: '0.25rem 0.5rem',
                            borderRadius: '0.25rem',
                            background: '#f3f4f6',
                            fontSize: '0.75rem'
                          }}>
                            {expense.category}
                          </span>
                        </td>
                        <td style={{ fontWeight: '600' }}>{formatCurrency(expense.amount)}</td>
                        <td>
                          <span style={{
                            padding: '0.25rem 0.5rem',
                            borderRadius: '0.25rem',
                            background: expense.cost_type === 'CAPEX' ? '#dbeafe' : '#fef3c7',
                            color: expense.cost_type === 'CAPEX' ? '#1e40af' : '#92400e',
                            fontSize: '0.75rem',
                            fontWeight: '500'
                          }}>
                            {expense.cost_type || 'N/A'}
                          </span>
                        </td>
                        <td>
                          <StatusBadge status={expense.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Budget Increase Modal */}
      {showBudgetModal && selectedWbsForBudget && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '2rem'
        }}>
          <div style={{
            background: 'white',
            borderRadius: '0.5rem',
            maxWidth: '500px',
            width: '100%',
            padding: '2rem'
          }}>
            {/* Modal Header */}
            <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '600' }}>
                Increase Budget for {selectedWbsForBudget.category}
              </h3>
              <button
                onClick={() => setShowBudgetModal(false)}
                style={{
                  padding: '0.5rem',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  borderRadius: '0.25rem'
                }}
              >
                <X size={24} />
              </button>
            </div>

            {/* Current Budget Info */}
            <div style={{
              padding: '1rem',
              background: '#f9fafb',
              borderRadius: '0.5rem',
              marginBottom: '1.5rem'
            }}>
              <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                Current Budget
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: '600', color: '#2B4628' }}>
                {formatCurrency(parseFloat(selectedWbsForBudget.budget_estimate))}
              </div>
            </div>

            {/* Form */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                Increase Amount ($) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={budgetIncreaseAmount}
                onChange={(e) => setBudgetIncreaseAmount(e.target.value)}
                placeholder="Enter amount to increase"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.5rem',
                  fontSize: '1rem'
                }}
              />
              {budgetIncreaseAmount && parseFloat(budgetIncreaseAmount) > 0 && (
                <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#3b82f6' }}>
                  New budget will be: {formatCurrency(parseFloat(selectedWbsForBudget.budget_estimate) + parseFloat(budgetIncreaseAmount))}
                </div>
              )}
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                Reason for Increase *
              </label>
              <textarea
                value={budgetIncreaseReason}
                onChange={(e) => setBudgetIncreaseReason(e.target.value)}
                placeholder="Explain why this budget increase is needed..."
                rows="4"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.5rem',
                  fontSize: '0.875rem',
                  resize: 'vertical'
                }}
              />
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowBudgetModal(false)}
                style={{
                  padding: '0.75rem 1.5rem',
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.5rem',
                  background: 'white',
                  color: '#6b7280',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleBudgetIncrease}
                style={{
                  padding: '0.75rem 1.5rem',
                  border: 'none',
                  borderRadius: '0.5rem',
                  background: '#3b82f6',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                <TrendingUp size={16} />
                Increase Budget
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectDetails;

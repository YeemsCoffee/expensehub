import React, { useState, useEffect, useCallback } from 'react';
import { AlertCircle, AlertTriangle, DollarSign, FileText, ArrowLeft, FolderOpen, Upload, X, Paperclip } from 'lucide-react';
import api from '../services/api';
import { useToast } from '../components/Toast';
import '../styles/expense-submit.css';

const ProjectExpenseSubmit = () => {
  const toast = useToast();
  const [project, setProject] = useState(null);
  const [wbsElements, setWbsElements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showReimbursableConfirm, setShowReimbursableConfirm] = useState(false);
  const [reimbursableConfirmed, setReimbursableConfirmed] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);

  // Smart defaults - load from localStorage
  const [recentVendors, setRecentVendors] = useState([]);

  // Get project ID from URL hash
  const getProjectId = () => {
    const hash = window.location.hash;
    const match = hash.match(/projectId=(\d+)/);
    return match ? match[1] : null;
  };

  const [newExpense, setNewExpense] = useState({
    date: new Date().toISOString().split('T')[0],
    description: '',
    amount: '',
    subtotal: '',
    tax: '',
    wbsElementId: '',
    vendorName: '',
    notes: '',
    isReimbursable: false
  });

  // Load smart defaults from localStorage
  useEffect(() => {
    const loadSmartDefaults = () => {
      try {
        const recentExpenses = localStorage.getItem('recentExpenses');

        if (recentExpenses) {
          const expenses = JSON.parse(recentExpenses);
          const vendors = [...new Set(expenses.map(e => e.vendorName).filter(Boolean))];
          setRecentVendors(vendors.slice(0, 5));
        }
      } catch (err) {
        console.error('Error loading smart defaults:', err);
      }
    };

    loadSmartDefaults();
  }, []);

  // Fetch initial data
  const fetchData = useCallback(async () => {
    const projectId = getProjectId();

    if (!projectId) {
      toast.error('No project specified. Please select a project first.');
      setLoading(false);
      return;
    }

    try {
      const [projResponse, wbsResponse] = await Promise.all([
        api.get(`/projects/${projectId}`),
        api.get(`/projects/${projectId}/wbs`)
      ]);

      setProject(projResponse.data);
      setWbsElements(Array.isArray(wbsResponse.data) ? wbsResponse.data : []);

      // Verify project is approved
      if (projResponse.data.status !== 'approved') {
        toast.error('This project is not approved yet. Expenses can only be submitted for approved projects.');
      }

      setLoading(false);
    } catch (err) {
      console.error('Error fetching data:', err);
      toast.error('Failed to load project data. Please try again.');
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    const maxSize = 10 * 1024 * 1024; // 10MB
    const validFiles = [];

    for (const file of files) {
      if (file.size > maxSize) {
        toast.error(`File ${file.name} exceeds 10MB limit`);
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length > 0) {
      setAttachedFiles(prev => [...prev, ...validFiles]);
      toast.success(`${validFiles.length} file(s) attached`);
    }
  };

  // Drag and drop handlers
  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set to false if we're leaving the drop zone itself
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const maxSize = 10 * 1024 * 1024; // 10MB
    const allowedTypes = ['.pdf', '.png', '.jpg', '.jpeg', '.doc', '.docx', '.xls', '.xlsx'];
    const validFiles = [];

    for (const file of files) {
      // Check file size
      if (file.size > maxSize) {
        toast.error(`File ${file.name} exceeds 10MB limit`);
        continue;
      }

      // Check file type
      const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
      if (!allowedTypes.includes(fileExtension)) {
        toast.error(`File ${file.name} has an unsupported file type`);
        continue;
      }

      validFiles.push(file);
    }

    if (validFiles.length > 0) {
      setAttachedFiles(prev => [...prev, ...validFiles]);
      toast.success(`${validFiles.length} file(s) attached`);
    }
  };

  const handleRemoveFile = (index) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Add to recent expenses
  const addToRecentExpenses = useCallback((expense) => {
    try {
      const recentExpenses = localStorage.getItem('recentExpenses');
      const expenses = recentExpenses ? JSON.parse(recentExpenses) : [];

      expenses.unshift({
        vendorName: expense.vendorName
      });

      localStorage.setItem('recentExpenses', JSON.stringify(expenses.slice(0, 10)));
    } catch (err) {
      console.error('Error saving recent expenses:', err);
    }
  }, []);

  const handleInputChange = (field, value) => {
    setNewExpense({ ...newExpense, [field]: value });
  };

  const determineCostType = (category, amount) => {
    const capexKeywords = ['equipment', 'hardware', 'furniture', 'fixtures', 'vehicle'];
    const capexThreshold = 2500;

    const categoryLower = category.toLowerCase();
    const hasCapexKeyword = capexKeywords.some(keyword => categoryLower.includes(keyword));

    if (hasCapexKeyword && amount >= capexThreshold) {
      return 'CAPEX';
    }

    return 'OPEX';
  };

  const handleReimbursableConfirm = () => {
    setShowReimbursableConfirm(false);
    setReimbursableConfirmed(true);
    setTimeout(() => handleSubmit(), 50);
  };

  const handleReimbursableCancel = () => {
    setShowReimbursableConfirm(false);
    setReimbursableConfirmed(false);
  };

  const handleSubmit = async () => {
    // Validation - WBS element is REQUIRED for project expenses
    if (!newExpense.date || !newExpense.description ||
        !newExpense.amount || !newExpense.wbsElementId) {
      toast.error('Please fill in all required fields including WBS element');
      return;
    }

    // If reimbursable and not confirmed, show confirmation modal
    if (newExpense.isReimbursable && !reimbursableConfirmed) {
      setShowReimbursableConfirm(true);
      return;
    }

    setIsSubmitting(true);
    toast.success('Expense submitted! Syncing...', { duration: 2000 });

    try {
      // Get category from selected WBS element
      const selectedWbs = wbsElements.find(w => w.id === parseInt(newExpense.wbsElementId));
      if (!selectedWbs) {
        toast.error('Selected WBS element not found');
        setIsSubmitting(false);
        return;
      }

      const category = selectedWbs.category;
      const costType = determineCostType(category, parseFloat(newExpense.amount));

      await new Promise(resolve => setTimeout(resolve, 500));

      // TODO: Add file upload support to backend
      // For now, submit without files - files are collected but not sent
      const response = await api.post('/expenses', {
        date: newExpense.date,
        description: newExpense.description,
        category: category,
        amount: parseFloat(newExpense.amount),
        subtotal: newExpense.subtotal ? parseFloat(newExpense.subtotal) : null,
        tax: newExpense.tax ? parseFloat(newExpense.tax) : null,
        // Project expenses use project's cost center
        costCenterId: project.cost_center_id,
        projectId: project.id,
        wbsElementId: parseInt(newExpense.wbsElementId),
        costType: costType,
        vendorName: newExpense.vendorName,
        notes: newExpense.notes,
        isReimbursable: newExpense.isReimbursable
      });

      addToRecentExpenses(newExpense);

      const expense = response.data.expense;
      if (expense.status === 'approved') {
        toast.success('Expense automatically approved! ✓');
      } else {
        toast.success('Project expense submitted successfully! ✓');
      }

      // Reset form
      setNewExpense({
        date: new Date().toISOString().split('T')[0],
        description: '',
        amount: '',
        subtotal: '',
        tax: '',
        wbsElementId: '',
        vendorName: '',
        notes: '',
        isReimbursable: newExpense.isReimbursable
      });

      setAttachedFiles([]);
      setReimbursableConfirmed(false);

    } catch (err) {
      console.error('Submission error:', err);
      toast.error(err.response?.data?.error || 'Failed to submit expense. Please try again.');
      setReimbursableConfirmed(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="page-loading">
        <div className="skeleton skeleton-title"></div>
        <div className="skeleton skeleton-card"></div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="expense-submit-container">
        <div className="empty-state">
          <h3>Project not found</h3>
          <p>Please select a project to submit expenses.</p>
          <button onClick={() => window.location.hash = '#projects'} className="btn-primary">
            Go to Projects
          </button>
        </div>
      </div>
    );
  }

  if (project.status !== 'approved') {
    return (
      <div className="expense-submit-container">
        <div className="empty-state">
          <AlertTriangle size={48} color="#f59e0b" />
          <h3>Project Not Approved</h3>
          <p>Expenses can only be submitted for approved projects.</p>
          <p>Project Status: <strong>{project.status}</strong></p>
          <button onClick={() => window.location.hash = `#project-details/${project.id}`} className="btn-primary">
            View Project Details
          </button>
        </div>
      </div>
    );
  }

  // Get selected WBS element for category display
  const selectedWbs = wbsElements.find(w => w.id === parseInt(newExpense.wbsElementId));

  return (
    <div className="expense-submit-container">
      {/* Header with Project Info */}
      <div className="expense-submit-header" style={{ marginBottom: '1.5rem' }}>
        <button
          onClick={() => window.location.hash = `#project-details/${project.id}`}
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
          Back to Project
        </button>

        <h2 className="expense-submit-title">Submit Project Expense</h2>

        {/* Project Context Card */}
        <div style={{
          padding: '1rem',
          background: '#f0f8fa',
          border: '1px solid #a0c5ce',
          borderRadius: '0.5rem',
          marginTop: '1rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <FolderOpen size={20} color="#5a7353" />
            <div>
              <div style={{ fontWeight: '600', fontSize: '1rem' }}>{project.name}</div>
              <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                Project Code: <strong>{project.code}</strong>
              </div>
            </div>
          </div>
          {project.description && (
            <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.5rem', marginBottom: 0 }}>
              {project.description}
            </p>
          )}
        </div>
      </div>

      <div className="expense-form-card">
        {/* WBS Element Selection - PRIMARY FIELD */}
        <div className="form-section-header">
          <FolderOpen size={20} className="form-section-icon" />
          Budget Category (WBS Element)
        </div>

        <div className="expense-form-grid-full" style={{ marginBottom: '1.5rem' }}>
          <div className="expense-form-group">
            <label className="expense-form-label">
              WBS Element / Budget Category <span className="required-indicator">*</span>
            </label>
            <select
              value={newExpense.wbsElementId}
              onChange={(e) => handleInputChange('wbsElementId', e.target.value)}
              className="expense-form-select"
              required
            >
              <option value="">Select WBS element</option>
              {wbsElements.map((wbs) => (
                <option key={wbs.id} value={wbs.id}>
                  {wbs.code} - {wbs.category} (Budget: ${parseFloat(wbs.budget_estimate).toFixed(2)})
                </option>
              ))}
            </select>
            {wbsElements.length === 0 && (
              <p className="expense-form-hint" style={{ color: '#ef4444' }}>
                ⚠️ No WBS elements defined for this project. Please contact your project manager.
              </p>
            )}
            {selectedWbs && (
              <div style={{
                marginTop: '0.75rem',
                padding: '0.75rem',
                background: '#e3e9e1',
                borderRadius: '0.375rem',
                fontSize: '0.875rem'
              }}>
                <div style={{ marginBottom: '0.5rem' }}>
                  <strong>Category:</strong> {selectedWbs.category}
                </div>
                <div>
                  <strong>Budget Status:</strong> $
                  {(parseFloat(selectedWbs.total_spent) || 0).toFixed(2)} of $
                  {parseFloat(selectedWbs.budget_estimate).toFixed(2)} used
                  ({selectedWbs.budget_estimate > 0
                    ? ((parseFloat(selectedWbs.total_spent) / parseFloat(selectedWbs.budget_estimate)) * 100).toFixed(1)
                    : 0}%)
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Amount Section */}
        <div className="form-section-header">
          <DollarSign size={20} className="form-section-icon" />
          Amount Details
        </div>

        <div className="amount-fields-grid expense-form-grid-full" style={{ marginBottom: '1.5rem' }}>
          <div className="expense-form-group">
            <label className="expense-form-label">
              Amount (Total) <span className="required-indicator">*</span>
            </label>
            <input
              type="number"
              step="0.01"
              value={newExpense.amount}
              onChange={(e) => handleInputChange('amount', e.target.value)}
              placeholder="0.00"
              className="expense-form-input"
              required
            />
            {parseFloat(newExpense.amount) >= 2500 && (
              <p className="expense-form-hint form-hint-warning">
                <AlertCircle size={14} />
                Amount over $2,500 may require additional approval
              </p>
            )}
          </div>

          <div className="expense-form-group">
            <label className="expense-form-label">Subtotal</label>
            <input
              type="number"
              step="0.01"
              value={newExpense.subtotal}
              onChange={(e) => handleInputChange('subtotal', e.target.value)}
              placeholder="0.00"
              className="expense-form-input"
            />
            <p className="expense-form-hint">Before tax</p>
          </div>

          <div className="expense-form-group">
            <label className="expense-form-label">Tax</label>
            <input
              type="number"
              step="0.01"
              value={newExpense.tax}
              onChange={(e) => handleInputChange('tax', e.target.value)}
              placeholder="0.00"
              className="expense-form-input"
            />
          </div>
        </div>

        {/* Basic Details Section */}
        <div className="form-section-header">
          <FileText size={20} className="form-section-icon" />
          Basic Information
        </div>

        <div className="expense-form-grid">
          <div className="expense-form-group">
            <label className="expense-form-label">
              Date <span className="required-indicator">*</span>
            </label>
            <input
              type="date"
              value={newExpense.date}
              onChange={(e) => handleInputChange('date', e.target.value)}
              className="expense-form-input"
              max={new Date().toISOString().split('T')[0]}
              required
            />
            <p className="expense-form-hint">Defaults to today</p>
          </div>

          <div className="expense-form-group expense-form-grid-full">
            <label className="expense-form-label">
              Description <span className="required-indicator">*</span>
            </label>
            <input
              type="text"
              value={newExpense.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              placeholder="e.g., Construction materials for Phase 1"
              className="expense-form-input"
              maxLength={200}
              required
            />
            <p className="expense-form-hint">
              {newExpense.description.length}/200 characters
            </p>
          </div>

          <div className="expense-form-group">
            <label className="expense-form-label">Vendor Name</label>
            <input
              type="text"
              value={newExpense.vendorName}
              onChange={(e) => handleInputChange('vendorName', e.target.value)}
              placeholder="e.g., Acme Construction Supply"
              className="expense-form-input"
              list="recent-vendors"
            />
            {recentVendors.length > 0 && (
              <datalist id="recent-vendors">
                {recentVendors.map((vendor, idx) => (
                  <option key={idx} value={vendor} />
                ))}
              </datalist>
            )}
          </div>

          <div className="expense-form-group expense-form-grid-full">
            <label className="expense-form-label">Additional Notes</label>
            <textarea
              value={newExpense.notes}
              onChange={(e) => handleInputChange('notes', e.target.value)}
              placeholder="Add any additional context or details..."
              className="expense-form-textarea"
              maxLength={500}
            />
            <p className="expense-form-hint">
              {newExpense.notes.length}/500 characters
            </p>
          </div>

          <div className="expense-form-group expense-form-grid-full">
            <div className="checkbox-group" onClick={() => handleInputChange('isReimbursable', !newExpense.isReimbursable)}>
              <input
                type="checkbox"
                checked={newExpense.isReimbursable}
                onChange={(e) => handleInputChange('isReimbursable', e.target.checked)}
                onClick={(e) => e.stopPropagation()}
              />
              <span className="checkbox-label">Reimbursable to employee</span>
            </div>
          </div>
        </div>

        {/* File Attachments Section */}
        <div className="form-section-header">
          <Paperclip size={20} className="form-section-icon" />
          Attachments
        </div>

        <div className="expense-form-grid-full">
          <div className="expense-form-group">
            <label
              htmlFor="file-upload"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '2rem',
                border: isDragging ? '2px dashed #2B4628' : '2px dashed #d1d5db',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                background: isDragging ? '#e6f4ea' : '#f9fafb',
                transition: 'all 0.2s',
              }}
              onDragEnter={handleDragEnter}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onMouseEnter={(e) => {
                if (!isDragging) {
                  e.currentTarget.style.borderColor = '#2B4628';
                  e.currentTarget.style.background = '#f0f8fa';
                }
              }}
              onMouseLeave={(e) => {
                if (!isDragging) {
                  e.currentTarget.style.borderColor = '#d1d5db';
                  e.currentTarget.style.background = '#f9fafb';
                }
              }}
            >
              <Upload size={40} color={isDragging ? '#2B4628' : '#6b7280'} />
              <div style={{ marginTop: '1rem', fontSize: '1rem', fontWeight: '600', color: isDragging ? '#2B4628' : '#374151' }}>
                {isDragging ? 'Drop files here' : 'Click to upload or drag & drop'}
              </div>
              <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#6b7280' }}>
                Receipts, invoices, or supporting documents
              </p>
              <p style={{ marginTop: '0.25rem', fontSize: '0.75rem', color: '#9ca3af' }}>
                PDF, PNG, JPG, DOC, XLSX • Max 10MB per file
              </p>
              <input
                id="file-upload"
                type="file"
                multiple
                accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
            </label>

            {/* Display attached files */}
            {attachedFiles.length > 0 && (
              <div style={{ marginTop: '1rem' }}>
                <div style={{ fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem', color: '#374151' }}>
                  Attached Files ({attachedFiles.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {attachedFiles.map((file, index) => (
                    <div
                      key={index}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.75rem',
                        background: 'white',
                        border: '1px solid #e5e7eb',
                        borderRadius: '0.375rem',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
                        <Paperclip size={16} color="#6b7280" />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '0.875rem', fontWeight: '500', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {file.name}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                            {(file.size / 1024).toFixed(1)} KB
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveFile(index)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: '0.5rem',
                          border: 'none',
                          background: 'transparent',
                          cursor: 'pointer',
                          color: '#ef4444',
                          borderRadius: '0.25rem',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#fee2e2';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <X size={18} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Submit Button */}
        <button
          onClick={handleSubmit}
          className="expense-submit-btn"
          disabled={isSubmitting || wbsElements.length === 0}
        >
          {isSubmitting ? (
            <>
              <span className="btn-spinner"></span>
              Submitting...
            </>
          ) : (
            'Submit Project Expense'
          )}
        </button>
      </div>

      {/* Reimbursable Expense Confirmation Modal */}
      {showReimbursableConfirm && (
        <div className="modal-overlay" onClick={handleReimbursableCancel}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ textAlign: 'center' }}>
              <div className="modal-icon-wrapper" style={{ background: '#FEF3C7' }}>
                <AlertTriangle size={32} color="#F59E0B" />
              </div>

              <h3 className="modal-title">Confirm Reimbursable Expense</h3>

              <p className="modal-description">
                You've marked this expense as <strong>reimbursable</strong>. This means you expect to be reimbursed for this expense.
                <br /><br />
                Once approved, this will create a <strong>bill payable to you</strong> in Xero for reimbursement processing.
                <br /><br />
                Is this correct?
              </p>

              <div className="modal-actions">
                <button
                  onClick={handleReimbursableCancel}
                  className="modal-btn modal-btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReimbursableConfirm}
                  className="modal-btn modal-btn-primary"
                >
                  Yes, Submit
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectExpenseSubmit;

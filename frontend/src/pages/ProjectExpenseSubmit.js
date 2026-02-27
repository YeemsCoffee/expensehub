import React, { useState, useEffect, useCallback } from 'react';
import { AlertCircle, CheckCircle, Camera, AlertTriangle, DollarSign, FileText, MapPin, ArrowLeft, FolderOpen } from 'lucide-react';
import { EXPENSE_CATEGORIES } from '../utils/constants';
import api from '../services/api';
import { useToast } from '../components/Toast';
import ReceiptUpload from '../components/ReceiptUpload';
import '../styles/expense-submit.css';

const ProjectExpenseSubmit = () => {
  const toast = useToast();
  const [project, setProject] = useState(null);
  const [costCenters, setCostCenters] = useState([]);
  const [locations, setLocations] = useState([]);
  const [wbsElements, setWbsElements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showReceiptUpload, setShowReceiptUpload] = useState(false);
  const [receiptId, setReceiptId] = useState(null);
  const [showReimbursableConfirm, setShowReimbursableConfirm] = useState(false);
  const [reimbursableConfirmed, setReimbursableConfirmed] = useState(false);

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
    tip: '',
    costCenterId: '',
    locationId: '',
    wbsElementId: '',
    vendorName: '',
    glAccount: '',
    notes: '',
    isReimbursable: false
  });

  // Load smart defaults from localStorage
  useEffect(() => {
    const loadSmartDefaults = () => {
      try {
        const savedDefaults = localStorage.getItem('expenseDefaults');
        const recentExpenses = localStorage.getItem('recentExpenses');

        if (savedDefaults) {
          const defaults = JSON.parse(savedDefaults);
          setNewExpense(prev => ({
            ...prev,
            costCenterId: defaults.costCenterId || prev.costCenterId,
            locationId: defaults.locationId || prev.locationId,
            isReimbursable: defaults.isReimbursable ?? prev.isReimbursable
          }));
        }

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
      const [projResponse, ccResponse, locResponse, wbsResponse] = await Promise.all([
        api.get(`/projects/${projectId}`),
        api.get('/cost-centers'),
        api.get('/locations'),
        api.get(`/projects/${projectId}/wbs`)
      ]);

      setProject(projResponse.data);
      setCostCenters(Array.isArray(ccResponse.data) ? ccResponse.data : []);
      setLocations(Array.isArray(locResponse.data) ? locResponse.data : []);
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

  // Save defaults when form changes
  const saveSmartDefaults = useCallback((field, value) => {
    if (['costCenterId', 'locationId', 'isReimbursable'].includes(field)) {
      try {
        const savedDefaults = localStorage.getItem('expenseDefaults');
        const defaults = savedDefaults ? JSON.parse(savedDefaults) : {};
        defaults[field] = value;
        localStorage.setItem('expenseDefaults', JSON.stringify(defaults));
      } catch (err) {
        console.error('Error saving defaults:', err);
      }
    }
  }, []);

  // Add to recent expenses
  const addToRecentExpenses = useCallback((expense) => {
    try {
      const recentExpenses = localStorage.getItem('recentExpenses');
      const expenses = recentExpenses ? JSON.parse(recentExpenses) : [];

      expenses.unshift({
        vendorName: expense.vendorName,
        costCenterId: expense.costCenterId,
        locationId: expense.locationId
      });

      localStorage.setItem('recentExpenses', JSON.stringify(expenses.slice(0, 10)));
    } catch (err) {
      console.error('Error saving recent expenses:', err);
    }
  }, []);

  const handleInputChange = (field, value) => {
    setNewExpense({ ...newExpense, [field]: value });
    saveSmartDefaults(field, value);
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

  const handleReceiptProcessed = (extractedData, receiptId) => {
    setNewExpense(prev => ({
      ...prev,
      vendorName: extractedData.vendor || prev.vendorName,
      date: extractedData.date || prev.date,
      amount: extractedData.amount?.toString() || prev.amount,
      subtotal: extractedData.subtotal?.toString() || prev.subtotal,
      tax: extractedData.tax?.toString() || prev.tax,
      tip: extractedData.tip?.toString() || prev.tip,
      description: extractedData.description || prev.description,
      notes: extractedData.notes || prev.notes
    }));

    setReceiptId(receiptId);
    setShowReceiptUpload(false);
    toast.success('Receipt data extracted! Review and submit.');
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
        !newExpense.amount || !newExpense.costCenterId || !newExpense.wbsElementId) {
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

      const response = await api.post('/expenses', {
        date: newExpense.date,
        description: newExpense.description,
        category: category,
        amount: parseFloat(newExpense.amount),
        costCenterId: parseInt(newExpense.costCenterId),
        locationId: newExpense.locationId ? parseInt(newExpense.locationId) : null,
        projectId: project.id,
        wbsElementId: parseInt(newExpense.wbsElementId),
        costType: costType,
        vendorName: newExpense.vendorName,
        glAccount: newExpense.glAccount,
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

      // Reset form but keep smart defaults
      setNewExpense({
        date: new Date().toISOString().split('T')[0],
        description: '',
        amount: '',
        subtotal: '',
        tax: '',
        tip: '',
        costCenterId: newExpense.costCenterId,
        locationId: newExpense.locationId,
        wbsElementId: '',
        vendorName: '',
        glAccount: '',
        notes: '',
        isReimbursable: newExpense.isReimbursable
      });

      setReceiptId(null);
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

      {/* Smart suggestions banner */}
      {newExpense.costCenterId && (
        <div className="smart-suggestion-banner">
          <CheckCircle size={18} />
          <span>Using your last settings</span>
        </div>
      )}

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

          <div className="expense-form-group">
            <label className="expense-form-label">Tip</label>
            <input
              type="number"
              step="0.01"
              value={newExpense.tip}
              onChange={(e) => handleInputChange('tip', e.target.value)}
              placeholder="0.00"
              className="expense-form-input"
            />
            <p className="expense-form-hint">Meals only</p>
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

          <div className="expense-form-group">
            <label className="expense-form-label">GL Account</label>
            <input
              type="text"
              value={newExpense.glAccount}
              onChange={(e) => handleInputChange('glAccount', e.target.value)}
              placeholder="6000-100"
              className="expense-form-input"
            />
          </div>
        </div>

        {/* Location & Cost Center Section */}
        <div className="form-section-header">
          <MapPin size={20} className="form-section-icon" />
          Assignment
        </div>

        <div className="expense-form-grid">
          <div className="expense-form-group">
            <label className="expense-form-label">
              Cost Center <span className="required-indicator">*</span>
            </label>
            <select
              value={newExpense.costCenterId}
              onChange={(e) => handleInputChange('costCenterId', e.target.value)}
              className="expense-form-select"
              required
            >
              <option value="">Select cost center</option>
              {costCenters.map((cc) => (
                <option key={cc.id} value={cc.id}>{cc.code} - {cc.name}</option>
              ))}
            </select>
          </div>

          <div className="expense-form-group">
            <label className="expense-form-label">Location</label>
            <select
              value={newExpense.locationId}
              onChange={(e) => handleInputChange('locationId', e.target.value)}
              className="expense-form-select"
            >
              <option value="">Select location</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>{loc.code} - {loc.name}</option>
              ))}
            </select>
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

        {/* Receipt Upload Section */}
        <div className="form-section-header">
          <Camera size={20} className="form-section-icon" />
          Receipt
        </div>

        <div className="expense-form-grid-full">
          {receiptId ? (
            <div className="receipt-processed">
              <div className="receipt-processed-info">
                <CheckCircle size={20} />
                <span className="receipt-processed-text">Receipt processed with AI - Data extracted!</span>
              </div>
              <button
                type="button"
                className="remove-receipt-btn"
                onClick={() => setReceiptId(null)}
              >
                Remove
              </button>
            </div>
          ) : (
            <div className="receipt-upload-section" onClick={() => setShowReceiptUpload(true)}>
              <div className="receipt-upload-icon">
                <Camera size={40} />
              </div>
              <div className="receipt-upload-title">Scan Receipt with AI</div>
              <p className="receipt-upload-description">Auto-extract vendor, date, amount & more</p>
            </div>
          )}
          <p className="expense-form-hint" style={{ marginTop: '12px' }}>
            AI-powered OCR extracts data automatically • PDF, PNG, JPG • Max 10MB
          </p>
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

      {/* Receipt Upload Modal */}
      {showReceiptUpload && (
        <div className="modal-overlay" onClick={() => setShowReceiptUpload(false)}>
          <div className="modal-content modal-content-large" onClick={(e) => e.stopPropagation()}>
            <ReceiptUpload
              onReceiptProcessed={handleReceiptProcessed}
              onClose={() => setShowReceiptUpload(false)}
            />
          </div>
        </div>
      )}

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

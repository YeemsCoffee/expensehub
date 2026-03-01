import React, { useState, useEffect, useCallback } from 'react';
import { AlertCircle, CheckCircle, Camera, AlertTriangle, DollarSign, FileText, MapPin } from 'lucide-react';
import { EXPENSE_CATEGORIES } from '../utils/constants';
import api from '../services/api';
import { useToast } from '../components/Toast';
import ReceiptUpload from '../components/ReceiptUpload';
import '../styles/expense-submit.css';

const ExpenseSubmit = () => {
  const toast = useToast();
  const [costCenters, setCostCenters] = useState([]);
  const [locations, setLocations] = useState([]);
  const [projects, setProjects] = useState([]);
  const [wbsElements, setWbsElements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showReceiptUpload, setShowReceiptUpload] = useState(false);
  const [receiptId, setReceiptId] = useState(null);
  const [showReimbursableConfirm, setShowReimbursableConfirm] = useState(false);
  const [reimbursableConfirmed, setReimbursableConfirmed] = useState(false);

  // Smart defaults - load from localStorage
  const [recentVendors, setRecentVendors] = useState([]);
  const [suggestedCategory, setSuggestedCategory] = useState('');

  const [newExpense, setNewExpense] = useState({
    date: new Date().toISOString().split('T')[0], // Default to today
    description: '',
    category: '',
    amount: '',
    subtotal: '',
    tax: '',
    tip: '',
    costCenterId: '',
    locationId: '',
    projectId: '',
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
          // Extract unique vendors
          const vendors = [...new Set(expenses.map(e => e.vendorName).filter(Boolean))];
          setRecentVendors(vendors.slice(0, 5));
        }
      } catch (err) {
        console.error('Error loading smart defaults:', err);
      }
    };

    loadSmartDefaults();
  }, []);

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
      
      // Add new expense and keep last 10
      expenses.unshift({
        vendorName: expense.vendorName,
        category: expense.category,
        costCenterId: expense.costCenterId,
        locationId: expense.locationId
      });
      
      localStorage.setItem('recentExpenses', JSON.stringify(expenses.slice(0, 10)));
    } catch (err) {
      console.error('Error saving recent expenses:', err);
    }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [ccResponse, locResponse, projResponse] = await Promise.all([
        api.get('/cost-centers'),
        api.get('/locations'),
        api.get('/projects/approved')  // Use the correct endpoint
      ]);

      // Defensive checks for array responses
      setCostCenters(Array.isArray(ccResponse.data) ? ccResponse.data : []);
      setLocations(Array.isArray(locResponse.data) ? locResponse.data : []);

      // Projects are already filtered to approved status by the backend
      const projectsData = Array.isArray(projResponse.data) ? projResponse.data : [];
      setProjects(projectsData);

      setLoading(false);
    } catch (err) {
      console.error('Error fetching data:', err);
      console.error('Error details:', err.response?.data || err.message);
      toast.error('Failed to load form data. Please try again.');
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle pre-selected project from URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.hash.split('?')[1]);
    const projectId = urlParams.get('projectId');

    if (projectId && projects.length > 0) {
      // Check if the project exists in the approved projects list
      const projectExists = projects.some(p => p.id === parseInt(projectId));
      if (projectExists) {
        setNewExpense(prev => ({ ...prev, projectId }));
      }
    }
  }, [projects]);

  const handleInputChange = (field, value) => {
    const updates = { [field]: value };

    // If project changes, clear WBS element and fetch new WBS elements
    if (field === 'projectId') {
      updates.wbsElementId = '';
      if (value) {
        fetchWbsElements(value);
      } else {
        setWbsElements([]);
      }
    }

    setNewExpense({ ...newExpense, ...updates });
    saveSmartDefaults(field, value);

    // Smart category suggestion based on vendor
    if (field === 'vendorName' && value && recentVendors.length > 0) {
      // This could be enhanced with a more sophisticated matching algorithm
      const matchingVendor = recentVendors.find(v =>
        v.toLowerCase().includes(value.toLowerCase())
      );
      if (matchingVendor) {
        // In a real app, you'd look up the category for this vendor
        // For now, just show a hint
        setSuggestedCategory('Based on previous entries');
      }
    }
  };

  const fetchWbsElements = async (projectId) => {
    try {
      const response = await api.get(`/projects/${projectId}/wbs`);
      setWbsElements(response.data.filter(wbs => wbs.is_active));
    } catch (err) {
      console.error('Error fetching WBS elements:', err);
      setWbsElements([]);
    }
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
    // Auto-fill form with extracted data
    setNewExpense(prev => ({
      ...prev,
      vendorName: extractedData.vendor || prev.vendorName,
      date: extractedData.date || prev.date,
      amount: extractedData.amount?.toString() || prev.amount,
      subtotal: extractedData.subtotal?.toString() || prev.subtotal,
      tax: extractedData.tax?.toString() || prev.tax,
      tip: extractedData.tip?.toString() || prev.tip,
      category: extractedData.category || prev.category,
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
    // Trigger actual submission by calling handleSubmit again
    // (it will bypass the modal check this time)
    setTimeout(() => handleSubmit(), 50);
  };

  const handleReimbursableCancel = () => {
    setShowReimbursableConfirm(false);
    setReimbursableConfirmed(false);
  };

  const handleSubmit = async () => {
    // Validation
    // Category is optional if a WBS element is selected (since WBS has category)
    const categoryRequired = !newExpense.wbsElementId;
    if (!newExpense.date || !newExpense.description ||
        (categoryRequired && !newExpense.category) ||
        !newExpense.amount || !newExpense.costCenterId) {
      toast.error('Please fill in all required fields');
      return;
    }

    // If reimbursable and not confirmed, show confirmation modal
    if (newExpense.isReimbursable && !reimbursableConfirmed) {
      setShowReimbursableConfirm(true);
      return;
    }

    // Optimistic UI - show success immediately
    setIsSubmitting(true);

    // Show immediate success feedback
    toast.success('Expense submitted! Syncing...', { duration: 2000 });

    try {
      // Use WBS category if WBS element is selected, otherwise use manual category
      let finalCategory = newExpense.category;
      if (newExpense.wbsElementId && wbsElements.length > 0) {
        const selectedWbs = wbsElements.find(w => w.id === parseInt(newExpense.wbsElementId));
        if (selectedWbs) {
          finalCategory = selectedWbs.category;
        }
      }

      // Auto-calculate cost type
      // Project expenses default to CAPEX
      const costType = newExpense.projectId ? 'CAPEX' : determineCostType(finalCategory, parseFloat(newExpense.amount));

      // Simulate network delay for demo
      await new Promise(resolve => setTimeout(resolve, 500));

      const response = await api.post('/expenses', {
        date: newExpense.date,
        description: newExpense.description,
        category: finalCategory,
        amount: parseFloat(newExpense.amount),
        costCenterId: parseInt(newExpense.costCenterId),
        locationId: newExpense.locationId ? parseInt(newExpense.locationId) : null,
        projectId: newExpense.projectId ? parseInt(newExpense.projectId) : null,
        wbsElementId: newExpense.wbsElementId ? parseInt(newExpense.wbsElementId) : null,
        costType: costType,
        vendorName: newExpense.vendorName,
        glAccount: newExpense.glAccount,
        notes: newExpense.notes,
        isReimbursable: newExpense.isReimbursable
      });

      // Save to recent expenses
      addToRecentExpenses(newExpense);

      // Check if expense was auto-approved (no manager)
      const expense = response.data.expense;
      if (expense.status === 'approved') {
        toast.success('Expense automatically approved! ✓');
      } else {
        toast.success('Expense report submitted successfully! ✓');
      }

      // Reset form but keep smart defaults
      setNewExpense({
        date: new Date().toISOString().split('T')[0],
        description: '',
        category: '',
        amount: '',
        subtotal: '',
        tax: '',
        tip: '',
        costCenterId: newExpense.costCenterId, // Keep last used
        locationId: newExpense.locationId, // Keep last used
        projectId: '', // Reset project
        wbsElementId: '', // Reset WBS element
        vendorName: '',
        glAccount: '',
        notes: '',
        isReimbursable: newExpense.isReimbursable // Keep last used
      });

      setWbsElements([]); // Clear WBS elements

      setReceiptId(null);
      setReimbursableConfirmed(false); // Reset confirmation flag

    } catch (err) {
      console.error('Submission error:', err);
      toast.error(err.response?.data?.error || 'Failed to submit expense. Please try again.');
      setReimbursableConfirmed(false); // Reset on error too
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

  return (
    <div className="expense-submit-container">
      <div className="expense-submit-header">
        <h2 className="expense-submit-title">Submit New Expense</h2>
        <p className="expense-submit-subtitle">Create an expense report for approval</p>
      </div>

      {/* Smart suggestions banner */}
      {newExpense.costCenterId && (
        <div className="smart-suggestion-banner">
          <CheckCircle size={18} />
          <span>Using your last settings</span>
        </div>
      )}

      <div className="expense-form-card">
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

          <div className="expense-form-group">
            <label className="expense-form-label">
              Category {!newExpense.wbsElementId && <span className="required-indicator">*</span>}
            </label>
            <select
              value={newExpense.category}
              onChange={(e) => handleInputChange('category', e.target.value)}
              className="expense-form-select"
              required={!newExpense.wbsElementId}
              disabled={!!newExpense.wbsElementId}
            >
              <option value="">
                {newExpense.wbsElementId ? 'Category from WBS element' : 'Select a category'}
              </option>
              {EXPENSE_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            {newExpense.wbsElementId && wbsElements.length > 0 && (
              <p className="expense-form-hint" style={{ color: '#10b981' }}>
                Category will be auto-filled from selected WBS element: {
                  wbsElements.find(w => w.id === parseInt(newExpense.wbsElementId))?.category || ''
                }
              </p>
            )}
            {suggestedCategory && !newExpense.wbsElementId && (
              <p className="expense-form-hint">{suggestedCategory}</p>
            )}
          </div>

          <div className="expense-form-group expense-form-grid-full">
            <label className="expense-form-label">
              Description <span className="required-indicator">*</span>
            </label>
            <input
              type="text"
              value={newExpense.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              placeholder="e.g., Client dinner with ABC Corp"
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
              placeholder="e.g., Staples, Amazon Business"
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
            {recentVendors.length > 0 && (
              <p className="expense-form-hint">Recently used vendors available</p>
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

          <div className="expense-form-group">
            <label className="expense-form-label">Project</label>
            <select
              value={newExpense.projectId}
              onChange={(e) => handleInputChange('projectId', e.target.value)}
              className="expense-form-select"
            >
              <option value="">No project</option>
              {projects.map((proj) => (
                <option key={proj.id} value={proj.id}>{proj.code} - {proj.name}</option>
              ))}
            </select>
            {projects.length === 0 && (
              <p className="expense-form-hint">No approved projects available</p>
            )}
          </div>

          {newExpense.projectId && (
            <div className="expense-form-group">
              <label className="expense-form-label">WBS Element / Budget Category</label>
              <select
                value={newExpense.wbsElementId}
                onChange={(e) => handleInputChange('wbsElementId', e.target.value)}
                className="expense-form-select"
              >
                <option value="">Select WBS element</option>
                {wbsElements.map((wbs) => (
                  <option key={wbs.id} value={wbs.id}>
                    {wbs.code} - {wbs.category} (Budget: ${parseFloat(wbs.budget_estimate).toFixed(2)})
                  </option>
                ))}
              </select>
              {wbsElements.length === 0 && (
                <p className="expense-form-hint">No WBS elements defined for this project</p>
              )}
              {wbsElements.length > 0 && newExpense.wbsElementId && (
                <p className="expense-form-hint">
                  {(() => {
                    const selectedWbs = wbsElements.find(w => w.id === parseInt(newExpense.wbsElementId));
                    if (selectedWbs) {
                      const spent = parseFloat(selectedWbs.total_spent) || 0;
                      const budget = parseFloat(selectedWbs.budget_estimate);
                      const remaining = budget - spent;
                      const percentUsed = budget > 0 ? ((spent / budget) * 100).toFixed(1) : 0;
                      return `Spent: $${spent.toFixed(2)} / $${budget.toFixed(2)} (${percentUsed}% used, $${remaining.toFixed(2)} remaining)`;
                    }
                    return '';
                  })()}
                </p>
              )}
            </div>
          )}

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
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <span className="btn-spinner"></span>
              Submitting...
            </>
          ) : (
            'Submit Expense Report'
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

export default ExpenseSubmit;
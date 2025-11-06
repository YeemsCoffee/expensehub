import React, { useState, useEffect, useCallback } from 'react';
import { Upload, AlertCircle, CheckCircle, Camera } from 'lucide-react';
import { EXPENSE_CATEGORIES } from '../utils/constants';
import api from '../services/api';
import { useToast } from '../components/Toast';
import ReceiptUpload from '../components/ReceiptUpload';

const ExpenseSubmit = () => {
  const toast = useToast();
  const [costCenters, setCostCenters] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [receiptPreview, setReceiptPreview] = useState(null);
  const [showReceiptUpload, setShowReceiptUpload] = useState(false);
  const [receiptId, setReceiptId] = useState(null);

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
      const [ccResponse, locResponse] = await Promise.all([
        api.get('/cost-centers'),
        api.get('/locations')
      ]);

      setCostCenters(ccResponse.data);
      setLocations(locResponse.data);

      setLoading(false);
    } catch (err) {
      console.error('Error fetching data:', err);
      toast.error('Failed to load form data');
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleInputChange = (field, value) => {
    setNewExpense({ ...newExpense, [field]: value });
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


  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error('File size must be less than 10MB');
        return;
      }

      if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
        toast.error('Please upload an image or PDF file');
        return;
      }

      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setReceiptPreview(reader.result);
      };
      reader.readAsDataURL(file);

      toast.success('Receipt uploaded successfully!');
    }
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

  const handleSubmit = async () => {
    // Validation
    if (!newExpense.date || !newExpense.description || !newExpense.category || 
        !newExpense.amount || !newExpense.costCenterId) {
      toast.error('Please fill in all required fields');
      return;
    }

    // Optimistic UI - show success immediately
    setIsSubmitting(true);

    // Show immediate success feedback
    toast.success('Expense submitted! Syncing...', { duration: 2000 });

    try {
      // Auto-calculate cost type
      const costType = determineCostType(newExpense.category, parseFloat(newExpense.amount));

      // Simulate network delay for demo
      await new Promise(resolve => setTimeout(resolve, 500));

      await api.post('/expenses', {
        date: newExpense.date,
        description: newExpense.description,
        category: newExpense.category,
        amount: parseFloat(newExpense.amount),
        costCenterId: parseInt(newExpense.costCenterId),
        locationId: newExpense.locationId ? parseInt(newExpense.locationId) : null,
        costType: costType,
        vendorName: newExpense.vendorName,
        glAccount: newExpense.glAccount,
        notes: newExpense.notes,
        isReimbursable: newExpense.isReimbursable
      });

      // Save to recent expenses
      addToRecentExpenses(newExpense);

      toast.success('Expense report submitted successfully! ✓');

      // Reset form but keep smart defaults
      setNewExpense({
        date: new Date().toISOString().split('T')[0],
        description: '',
        category: '',
        amount: '',
        costCenterId: newExpense.costCenterId, // Keep last used
        locationId: newExpense.locationId, // Keep last used
        vendorName: '',
        glAccount: '',
        notes: '',
        isReimbursable: newExpense.isReimbursable // Keep last used
      });

      setReceiptPreview(null);
      
    } catch (err) {
      console.error('Submission error:', err);
      toast.error(err.response?.data?.error || 'Failed to submit expense. Please try again.');
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
    <div>
      <h2 className="page-title">Submit New Expense</h2>
      <p className="text-gray-600 mb-6">Submit an expense report for approval</p>
      
      <div className="card">
        <h3 className="card-title">Expense Details</h3>
        
        {/* Smart suggestions banner */}
        {newExpense.costCenterId && (
          <div className="smart-suggestion-banner">
            <CheckCircle size={16} color="#10b981" />
            <span>Using your last settings</span>
          </div>
        )}

        <div className="form-grid">
          {/* Row 1 */}
          <div className="form-group">
            <label className="form-label">Date *</label>
            <input
              type="date"
              value={newExpense.date}
              onChange={(e) => handleInputChange('date', e.target.value)}
              className="form-input"
              max={new Date().toISOString().split('T')[0]}
              required
            />
            <p className="form-hint">Defaults to today</p>
          </div>
          
          <div className="form-group">
            <label className="form-label">Amount (Total) *</label>
            <input
              type="number"
              step="0.01"
              value={newExpense.amount}
              onChange={(e) => handleInputChange('amount', e.target.value)}
              placeholder="0.00"
              className="form-input"
              required
            />
            {parseFloat(newExpense.amount) >= 2500 && (
              <p className="form-hint text-orange">
                <AlertCircle size={14} style={{ display: 'inline', marginRight: '4px' }} />
                Amount over $2,500 may require additional approval
              </p>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Subtotal</label>
            <input
              type="number"
              step="0.01"
              value={newExpense.subtotal}
              onChange={(e) => handleInputChange('subtotal', e.target.value)}
              placeholder="0.00"
              className="form-input"
            />
            <p className="form-hint">Amount before tax</p>
          </div>

          <div className="form-group">
            <label className="form-label">Tax</label>
            <input
              type="number"
              step="0.01"
              value={newExpense.tax}
              onChange={(e) => handleInputChange('tax', e.target.value)}
              placeholder="0.00"
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Tip</label>
            <input
              type="number"
              step="0.01"
              value={newExpense.tip}
              onChange={(e) => handleInputChange('tip', e.target.value)}
              placeholder="0.00"
              className="form-input"
            />
            <p className="form-hint">For meals/services</p>
          </div>

          <div className="form-group">
            <label className="form-label">Category *</label>
            <select
              value={newExpense.category}
              onChange={(e) => handleInputChange('category', e.target.value)}
              className="form-select"
              required
            >
              <option value="">Select a category</option>
              {EXPENSE_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            {suggestedCategory && (
              <p className="form-hint">{suggestedCategory}</p>
            )}
          </div>

          {/* Row 2 */}
          <div className="form-group">
            <label className="form-label">Cost Center *</label>
            <select
              value={newExpense.costCenterId}
              onChange={(e) => handleInputChange('costCenterId', e.target.value)}
              className="form-select"
              required
            >
              <option value="">Select cost center</option>
              {costCenters.map((cc) => (
                <option key={cc.id} value={cc.id}>{cc.code} - {cc.name}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Location</label>
            <select
              value={newExpense.locationId}
              onChange={(e) => handleInputChange('locationId', e.target.value)}
              className="form-select"
            >
              <option value="">Select location</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>{loc.code} - {loc.name}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Vendor Name</label>
            <input
              type="text"
              value={newExpense.vendorName}
              onChange={(e) => handleInputChange('vendorName', e.target.value)}
              placeholder="e.g., Staples, Amazon Business"
              className="form-input"
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
              <p className="form-hint">Recently used vendors available</p>
            )}
          </div>

          {/* Row 3 */}
          <div className="form-group form-grid-full">
            <label className="form-label">Description *</label>
            <input
              type="text"
              value={newExpense.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              placeholder="e.g., Client dinner with ABC Corp"
              className="form-input"
              maxLength={200}
              required
            />
            <p className="form-hint">
              {newExpense.description.length}/200 characters
            </p>
          </div>

          <div className="form-group">
            <label className="form-label">GL Account</label>
            <input
              type="text"
              value={newExpense.glAccount}
              onChange={(e) => handleInputChange('glAccount', e.target.value)}
              placeholder="6000-100"
              className="form-input"
            />
          </div>

          <div className="form-group form-grid-full">
            <label className="form-label">Notes</label>
            <textarea
              value={newExpense.notes}
              onChange={(e) => handleInputChange('notes', e.target.value)}
              placeholder="Additional notes or details"
              className="form-input"
              rows="2"
              maxLength={500}
            />
            <p className="form-hint">
              {newExpense.notes.length}/500 characters
            </p>
          </div>

          <div className="form-group">
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                checked={newExpense.isReimbursable}
                onChange={(e) => handleInputChange('isReimbursable', e.target.checked)}
              />
              Reimbursable to employee
            </label>
          </div>

          <div className="form-group form-grid-full">
            <label className="form-label">
              Attach Receipt
            </label>

            {receiptId ? (
              <div className="receipt-preview-container">
                <div className="alert alert-success">
                  <CheckCircle size={16} />
                  <span>Receipt processed with AI - Data extracted!</span>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setReceiptId(null);
                    setReceiptPreview(null);
                  }}
                  style={{ marginTop: '12px' }}
                >
                  Remove Receipt
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="receipt-option-btn upload-btn"
                style={{
                  border: '2px solid #e5e7eb',
                  borderRadius: '12px',
                  padding: '24px 16px',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 6px rgba(102, 126, 234, 0.3)',
                  marginTop: '12px',
                  width: '100%'
                }}
                onClick={() => setShowReceiptUpload(true)}
                onMouseOver={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 12px rgba(102, 126, 234, 0.4)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 6px rgba(102, 126, 234, 0.3)';
                }}
              >
                <Camera size={32} />
                <span style={{ fontSize: '16px', fontWeight: '600' }}>Scan Receipt with AI</span>
                <p style={{ margin: 0, fontSize: '13px', opacity: 0.9 }}>Auto-extract vendor, date, amount & more</p>
              </button>
            )}
            <p className="form-hint" style={{ marginTop: '12px' }}>
              AI-powered OCR extracts data automatically • PDF, PNG, JPG • Max 10MB
            </p>
          </div>
        </div>

        <button
          onClick={handleSubmit}
          className="btn btn-primary btn-full btn-lg mt-4"
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
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <ReceiptUpload
              onReceiptProcessed={handleReceiptProcessed}
              onClose={() => setShowReceiptUpload(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default ExpenseSubmit;
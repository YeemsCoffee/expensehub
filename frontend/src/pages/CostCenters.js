import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, DollarSign, Building } from 'lucide-react';
import api from '../services/api';

const CostCenters = () => {
  const [costCenters, setCostCenters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    budget: '',
    department: ''
  });
  const [error, setError] = useState('');

  useEffect(() => {
    fetchCostCenters();
  }, []);

  const fetchCostCenters = async () => {
    try {
      const response = await api.get('/cost-centers');
      setCostCenters(response.data);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching cost centers:', err);
      setLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    setFormData({ ...formData, [field]: value });
  };

  const resetForm = () => {
    setFormData({
      code: '',
      name: '',
      budget: '',
      department: ''
    });
    setEditingId(null);
    setShowForm(false);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validation - only code and name are required
    if (!formData.code || !formData.name) {
      setError('Please fill in code and name (required fields)');
      return;
    }

    try {
      if (editingId) {
        // Update existing cost center
        await api.put(`/cost-centers/${editingId}`, formData);
        alert('Cost center updated successfully!');
      } else {
        // Create new cost center
        await api.post('/cost-centers', formData);
        alert('Cost center created successfully!');
      }
      
      fetchCostCenters();
      resetForm();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save cost center');
    }
  };

  const handleEdit = (costCenter) => {
    setFormData({
      code: costCenter.code,
      name: costCenter.name,
      budget: costCenter.budget,
      department: costCenter.department || ''
    });
    setEditingId(costCenter.id);
    setShowForm(true);
  };

  const handleDelete = async (id, code) => {
    if (window.confirm(`Are you sure you want to delete cost center ${code}?`)) {
      try {
        await api.delete(`/cost-centers/${id}`);
        alert('Cost center deleted successfully!');
        fetchCostCenters();
      } catch (err) {
        alert(err.response?.data?.error || 'Failed to delete cost center');
      }
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  if (loading) {
    return <div className="page-title">Loading cost centers...</div>;
  }

  return (
    <div>
      <div className="page-header">
        <h2 className="page-title">Cost Centers</h2>
        <button 
          onClick={() => setShowForm(!showForm)}
          className="btn btn-primary"
        >
          <Plus size={20} />
          {showForm ? 'Cancel' : 'Add Cost Center'}
        </button>
      </div>

      {showForm && (
        <div className="card mb-6">
          <h3 className="card-title">
            {editingId ? 'Edit Cost Center' : 'Create New Cost Center'}
          </h3>
          
          {error && (
            <div className="error-message mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Cost Center Code *</label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => handleInputChange('code', e.target.value)}
                  placeholder="CC-001"
                  className="form-input"
                  required
                  disabled={editingId} // Can't change code when editing
                />
                <p className="form-hint">Unique identifier (e.g., CC-001, DEPT-HR)</p>
              </div>

              <div className="form-group">
                <label className="form-label">Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  placeholder="Marketing Department"
                  className="form-input"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Annual Budget</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.budget}
                  onChange={(e) => handleInputChange('budget', e.target.value)}
                  placeholder="50000.00"
                  className="form-input"
                />
                <p className="form-hint">Optional - Set annual budget for tracking</p>
              </div>

              <div className="form-group">
                <label className="form-label">Department</label>
                <input
                  type="text"
                  value={formData.department}
                  onChange={(e) => handleInputChange('department', e.target.value)}
                  placeholder="Marketing"
                  className="form-input"
                />
                <p className="form-hint">Optional - Organizational department</p>
              </div>
            </div>

            <div className="form-actions">
              <button type="submit" className="btn btn-primary">
                {editingId ? 'Update Cost Center' : 'Create Cost Center'}
              </button>
              <button 
                type="button" 
                onClick={resetForm}
                className="btn btn-secondary"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <h3 className="card-title">
          All Cost Centers ({costCenters.length})
        </h3>

        {costCenters.length === 0 ? (
          <div className="empty-state">
            <Building size={48} className="empty-state-icon" />
            <p className="empty-state-text">No cost centers yet</p>
            <p className="empty-state-subtext">
              Create your first cost center to start tracking expenses
            </p>
            <button 
              onClick={() => setShowForm(true)}
              className="btn btn-primary mt-4"
            >
              <Plus size={20} />
              Add Cost Center
            </button>
          </div>
        ) : (
          <div className="cost-center-grid">
            {costCenters.map((cc) => (
              <div key={cc.id} className="cost-center-card">
                <div className="cost-center-header">
                  <div>
                    <h4 className="cost-center-code">{cc.code}</h4>
                    <p className="cost-center-name">{cc.name}</p>
                  </div>
                  <div className="cost-center-actions">
                    <button
                      onClick={() => handleEdit(cc)}
                      className="btn-icon"
                      title="Edit"
                    >
                      <Edit2 size={18} />
                    </button>
                    <button
                      onClick={() => handleDelete(cc.id, cc.code)}
                      className="btn-icon btn-icon-danger"
                      title="Delete"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>

                <div className="cost-center-details">
                  {cc.department && (
                    <div className="cost-center-detail">
                      <Building size={16} className="detail-icon" />
                      <span>{cc.department}</span>
                    </div>
                  )}
                  {cc.budget && cc.budget > 0 && (
                    <div className="cost-center-detail">
                      <DollarSign size={16} className="detail-icon" />
                      <span>Budget: {formatCurrency(cc.budget)}</span>
                    </div>
                  )}
                </div>

                {cc.is_active ? (
                  <span className="badge badge-success">Active</span>
                ) : (
                  <span className="badge badge-secondary">Inactive</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CostCenters;
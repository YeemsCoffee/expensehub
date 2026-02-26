import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Folder, Calendar, DollarSign, User, Clock, CheckCircle, XCircle, Trash2, List } from 'lucide-react';
import api from '../services/api';

const Projects = () => {
  const [myProjects, setMyProjects] = useState([]);
  const [allProjects, setAllProjects] = useState([]);
  const [costCenters, setCostCenters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [isManager, setIsManager] = useState(false);
  const [formData, setFormData] = useState({
    costCenterId: '',
    name: '',
    description: '',
    startDate: '',
    endDate: '',
    budget: '',
    projectManager: ''
  });
  const [wbsElements, setWbsElements] = useState([]);
  const [error, setError] = useState('');

  const fetchProjects = useCallback(async () => {
    try {
      // Get current user info
      const userStr = localStorage.getItem('user');
      const user = userStr ? JSON.parse(userStr) : null;
      const userRole = user?.role || 'employee';
      setIsManager(userRole === 'manager' || userRole === 'admin');

      // Fetch cost centers for project submission
      const ccResponse = await api.get('/cost-centers');
      setCostCenters(ccResponse.data.filter(cc => cc.is_active));

      // Fetch my submitted projects
      const myResponse = await api.get('/projects/my-submissions');
      setMyProjects(myResponse.data);

      // If manager/admin, also fetch all pending projects
      if (userRole === 'manager' || userRole === 'admin') {
        const allResponse = await api.get('/projects/pending');
        setAllProjects(allResponse.data);
      }

      setLoading(false);
    } catch (err) {
      console.error('Error fetching projects:', err);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleInputChange = (field, value) => {
    setFormData({ ...formData, [field]: value });
  };

  const addWbsElement = () => {
    setWbsElements([...wbsElements, { category: '', budgetEstimate: '', description: '' }]);
  };

  const removeWbsElement = (index) => {
    setWbsElements(wbsElements.filter((_, i) => i !== index));
  };

  const updateWbsElement = (index, field, value) => {
    const updated = [...wbsElements];
    updated[index][field] = value;
    setWbsElements(updated);
  };

  const resetForm = () => {
    setFormData({
      costCenterId: '',
      name: '',
      description: '',
      startDate: '',
      endDate: '',
      budget: '',
      projectManager: ''
    });
    setWbsElements([]);
    setShowForm(false);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!formData.costCenterId || !formData.name || !formData.description) {
      setError('Please fill in cost center, name, and description (required fields)');
      return;
    }

    // Validate WBS elements if any
    if (wbsElements.length > 0) {
      const invalidElement = wbsElements.find(el => !el.category || !el.budgetEstimate || parseFloat(el.budgetEstimate) <= 0);
      if (invalidElement) {
        setError('All WBS elements must have a category and valid budget estimate');
        return;
      }

      // Calculate total WBS budget
      const totalWbsBudget = wbsElements.reduce((sum, el) => sum + parseFloat(el.budgetEstimate), 0);
      const projectBudget = formData.budget ? parseFloat(formData.budget) : 0;

      if (projectBudget > 0 && Math.abs(totalWbsBudget - projectBudget) > 0.01) {
        setError(`Total WBS budget ($${totalWbsBudget.toFixed(2)}) must equal project budget ($${projectBudget.toFixed(2)})`);
        return;
      }
    }

    try {
      const projectResponse = await api.post('/projects/submit', {
        costCenterId: parseInt(formData.costCenterId),
        name: formData.name,
        description: formData.description,
        startDate: formData.startDate || null,
        endDate: formData.endDate || null,
        budget: formData.budget ? parseFloat(formData.budget) : null,
        projectManager: formData.projectManager || null
      });

      const projectId = projectResponse.data.project.id;

      // Create WBS elements if any
      if (wbsElements.length > 0) {
        await api.post(`/projects/${projectId}/wbs`, {
          elements: wbsElements.map(el => ({
            category: el.category,
            budgetEstimate: parseFloat(el.budgetEstimate),
            description: el.description || null
          }))
        });
      }

      alert('Project submitted for approval!');
      fetchProjects();
      resetForm();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit project');
    }
  };

  const handleApprove = async (id) => {
    if (window.confirm('Approve this project?')) {
      try {
        await api.post(`/projects/${id}/approve`);
        alert('Project approved successfully!');
        fetchProjects();
      } catch (err) {
        alert(err.response?.data?.error || 'Failed to approve project');
      }
    }
  };

  const handleReject = async (id) => {
    const reason = window.prompt('Enter rejection reason:');
    if (reason) {
      try {
        await api.post(`/projects/${id}/reject`, { reason });
        alert('Project rejected');
        fetchProjects();
      } catch (err) {
        alert(err.response?.data?.error || 'Failed to reject project');
      }
    }
  };

  const formatCurrency = (amount) => {
    if (!amount) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const getStatusBadgeClass = (status) => {
    switch(status) {
      case 'approved': return 'badge-success';
      case 'pending': return 'badge-warning';
      case 'rejected': return 'badge-secondary';
      default: return 'badge-secondary';
    }
  };

  const getStatusIcon = (status) => {
    switch(status) {
      case 'approved': return <CheckCircle size={16} />;
      case 'pending': return <Clock size={16} />;
      case 'rejected': return <XCircle size={16} />;
      default: return <Clock size={16} />;
    }
  };

  if (loading) {
    return <div className="page-title">Loading projects...</div>;
  }

  return (
    <div className="container">
      <div className="page-header">
        <div>
          <h2 className="page-title">Project Requests</h2>
          <p className="text-gray-600">Submit new projects for approval</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="btn btn-primary"
        >
          <Plus size={20} />
          {showForm ? 'Cancel' : 'Submit Project'}
        </button>
      </div>

      {/* Project Submission Form */}
      {showForm && (
        <div className="card mb-6">
          <h3 className="card-title">Submit New Project</h3>
          
          {error && (
            <div className="error-message mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Cost Center *</label>
                <select
                  value={formData.costCenterId}
                  onChange={(e) => handleInputChange('costCenterId', e.target.value)}
                  className="form-input"
                  required
                >
                  <option value="">Select a cost center</option>
                  {costCenters.map(cc => (
                    <option key={cc.id} value={cc.id}>
                      {cc.code} - {cc.name}
                    </option>
                  ))}
                </select>
                <p className="form-hint">Project code will be auto-generated based on cost center</p>
              </div>

              <div className="form-group">
                <label className="form-label">Project Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  placeholder="Website Redesign"
                  className="form-input"
                  required
                />
              </div>

              <div className="form-group form-grid-full">
                <label className="form-label">Description *</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  placeholder="Describe the project objectives, scope, and expected outcomes"
                  className="form-input"
                  rows="4"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Proposed Start Date</label>
                <input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => handleInputChange('startDate', e.target.value)}
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Proposed End Date</label>
                <input
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => handleInputChange('endDate', e.target.value)}
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Total Project Budget</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.budget}
                  onChange={(e) => handleInputChange('budget', e.target.value)}
                  placeholder="100000.00"
                  className="form-input"
                />
                {wbsElements.length > 0 && (
                  <p className="form-hint" style={{ color: '#6b7280', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                    Total WBS Budget: ${wbsElements.reduce((sum, el) => sum + (parseFloat(el.budgetEstimate) || 0), 0).toFixed(2)}
                  </p>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Proposed Project Manager</label>
                <input
                  type="text"
                  value={formData.projectManager}
                  onChange={(e) => handleInputChange('projectManager', e.target.value)}
                  placeholder="John Doe"
                  className="form-input"
                />
              </div>
            </div>

            {/* WBS Elements Section */}
            <div style={{ marginTop: '2rem', padding: '1.5rem', background: '#F2ECD4', borderRadius: '0.5rem', border: '1px solid #e5e7eb' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div>
                  <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <List size={20} />
                    WBS Elements (Budget Breakdown)
                  </h4>
                  <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0.25rem 0 0 0' }}>
                    Break down project budget by category (e.g., Construction, Materials, Engineering)
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addWbsElement}
                  className="btn btn-secondary"
                  style={{ fontSize: '0.875rem' }}
                >
                  <Plus size={16} />
                  Add Category
                </button>
              </div>

              {wbsElements.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>
                  <p>No WBS elements added yet. Click "Add Category" to break down your budget.</p>
                  <p style={{ fontSize: '0.875rem' }}>Example categories: Construction, Materials, Engineering Studies, Equipment</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {wbsElements.map((element, index) => (
                    <div key={index} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr auto', gap: '1rem', padding: '1rem', background: 'white', borderRadius: '0.5rem', border: '1px solid #e5e7eb' }}>
                      <div>
                        <label className="form-label" style={{ fontSize: '0.875rem' }}>Category *</label>
                        <input
                          type="text"
                          value={element.category}
                          onChange={(e) => updateWbsElement(index, 'category', e.target.value)}
                          placeholder="e.g., Construction"
                          className="form-input"
                          style={{ fontSize: '0.875rem' }}
                        />
                        <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: '0.25rem 0 0 0' }}>
                          Code will be: {formData.costCenterId ? `${costCenters.find(cc => cc.id === parseInt(formData.costCenterId))?.code || 'XXX'}-XXX-${(index + 1).toString().padStart(2, '0')}` : 'Select cost center first'}
                        </p>
                      </div>
                      <div>
                        <label className="form-label" style={{ fontSize: '0.875rem' }}>Budget Estimate *</label>
                        <input
                          type="number"
                          step="0.01"
                          value={element.budgetEstimate}
                          onChange={(e) => updateWbsElement(index, 'budgetEstimate', e.target.value)}
                          placeholder="25000.00"
                          className="form-input"
                          style={{ fontSize: '0.875rem' }}
                        />
                      </div>
                      <div>
                        <label className="form-label" style={{ fontSize: '0.875rem' }}>Description</label>
                        <input
                          type="text"
                          value={element.description}
                          onChange={(e) => updateWbsElement(index, 'description', e.target.value)}
                          placeholder="Optional description"
                          className="form-input"
                          style={{ fontSize: '0.875rem' }}
                        />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                        <button
                          type="button"
                          onClick={() => removeWbsElement(index)}
                          style={{
                            padding: '0.5rem',
                            border: '1px solid #ef4444',
                            borderRadius: '0.375rem',
                            background: 'white',
                            color: '#ef4444',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                          title="Remove category"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="form-actions">
              <button type="submit" className="btn btn-primary">
                Submit for Approval
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

      {/* My Submitted Projects */}
      <div className="card mb-6">
        <h3 className="card-title">My Submitted Projects ({myProjects.length})</h3>

        {myProjects.length === 0 ? (
          <div className="empty-state">
            <Folder size={48} className="empty-state-icon" />
            <p className="empty-state-text">No projects submitted yet</p>
            <p className="empty-state-subtext">
              Submit your first project request to get started
            </p>
            <button 
              onClick={() => setShowForm(true)}
              className="btn btn-primary mt-4"
            >
              <Plus size={20} />
              Submit Project
            </button>
          </div>
        ) : (
          <div className="cost-center-grid">
            {myProjects.map((project) => (
              <div
                key={project.id}
                className="cost-center-card"
                onClick={() => window.location.hash = `#project-details/${project.id}`}
                style={{ cursor: 'pointer' }}
              >
                <div className="cost-center-header">
                  <div>
                    <h4 className="cost-center-code">{project.code}</h4>
                    <p className="cost-center-name">{project.name}</p>
                  </div>
                  <span className={`badge ${getStatusBadgeClass(project.status)}`}>
                    {getStatusIcon(project.status)}
                    <span className="ml-1">{project.status}</span>
                  </span>
                </div>

                {project.description && (
                  <p className="text-sm text-gray-600 mb-3">{project.description}</p>
                )}

                <div className="cost-center-details">
                  {project.start_date && (
                    <div className="cost-center-detail">
                      <Calendar size={16} className="detail-icon" />
                      <span>{formatDate(project.start_date)} - {formatDate(project.end_date)}</span>
                    </div>
                  )}
                  {project.project_manager && (
                    <div className="cost-center-detail">
                      <User size={16} className="detail-icon" />
                      <span>{project.project_manager}</span>
                    </div>
                  )}
                  {project.budget && (
                    <div className="cost-center-detail">
                      <DollarSign size={16} className="detail-icon" />
                      <span>Budget: {formatCurrency(project.budget)}</span>
                    </div>
                  )}
                  <div className="cost-center-detail">
                    <Clock size={16} className="detail-icon" />
                    <span>Submitted: {formatDate(project.created_at)}</span>
                  </div>
                </div>

                {project.rejection_reason && (
                  <div className="rejection-reason">
                    <strong>Rejection Reason:</strong> {project.rejection_reason}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pending Projects (Manager/Admin Only) */}
      {isManager && (
        <div className="card">
          <h3 className="card-title">Pending Approvals ({allProjects.length})</h3>

          {allProjects.length === 0 ? (
            <p className="text-gray-500" style={{ padding: '20px' }}>No projects pending approval</p>
          ) : (
            <div className="cost-center-grid">
              {allProjects.map((project) => (
                <div
                  key={project.id}
                  className="cost-center-card"
                  onClick={() => window.location.hash = `#project-details/${project.id}`}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="cost-center-header">
                    <div>
                      <h4 className="cost-center-code">{project.code}</h4>
                      <p className="cost-center-name">{project.name}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        By: {project.submitted_by_name}
                      </p>
                    </div>
                  </div>

                  {project.description && (
                    <p className="text-sm text-gray-600 mb-3">{project.description}</p>
                  )}

                  <div className="cost-center-details">
                    {project.start_date && (
                      <div className="cost-center-detail">
                        <Calendar size={16} className="detail-icon" />
                        <span>{formatDate(project.start_date)} - {formatDate(project.end_date)}</span>
                      </div>
                    )}
                    {project.project_manager && (
                      <div className="cost-center-detail">
                        <User size={16} className="detail-icon" />
                        <span>{project.project_manager}</span>
                      </div>
                    )}
                    {project.budget && (
                      <div className="cost-center-detail">
                        <DollarSign size={16} className="detail-icon" />
                        <span>Budget: {formatCurrency(project.budget)}</span>
                      </div>
                    )}
                  </div>

                  <div className="approval-actions">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleApprove(project.id);
                      }}
                      className="btn btn-success btn-sm"
                    >
                      <CheckCircle size={16} />
                      Approve
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleReject(project.id);
                      }}
                      className="btn btn-danger btn-sm"
                    >
                      <XCircle size={16} />
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Projects;
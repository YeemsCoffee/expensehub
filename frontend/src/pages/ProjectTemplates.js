import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './ProjectTemplates.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

function ProjectTemplates({ onClose, onProjectCreated }) {
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showInstantiateForm, setShowInstantiateForm] = useState(false);

  const [instantiateForm, setInstantiateForm] = useState({
    code: '',
    name: '',
    description: '',
    start_date: '',
    budget: '',
    project_manager: ''
  });

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/project-templates`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTemplates(response.data);
      setLoading(false);
    } catch (err) {
      setError('Failed to fetch project templates');
      setLoading(false);
    }
  };

  const fetchTemplateDetails = async (templateId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/project-templates/${templateId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSelectedTemplate(response.data);
    } catch (err) {
      setError('Failed to fetch template details');
    }
  };

  const handleInstantiate = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `${API_URL}/api/project-templates/${selectedTemplate.id}/instantiate`,
        instantiateForm,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setShowInstantiateForm(false);
      setSelectedTemplate(null);
      resetInstantiateForm();

      if (onProjectCreated) {
        onProjectCreated(response.data);
      } else {
        alert(`Project "${response.data.name}" created successfully!`);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create project from template');
    }
  };

  const resetInstantiateForm = () => {
    setInstantiateForm({
      code: '',
      name: '',
      description: '',
      start_date: '',
      budget: '',
      project_manager: ''
    });
  };

  const startInstantiate = (template) => {
    setSelectedTemplate(template);
    fetchTemplateDetails(template.id);
    setInstantiateForm({
      ...instantiateForm,
      description: template.description || '',
      budget: template.estimated_budget || ''
    });
    setShowInstantiateForm(true);
  };

  if (loading) return <div className="loading">Loading templates...</div>;

  return (
    <div className="project-templates-container">
      <div className="templates-header">
        <h2>Project Templates</h2>
        <div className="templates-actions">
          {onClose && <button className="btn btn-outline" onClick={onClose}>Close</button>}
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Template Details Modal */}
      {selectedTemplate && !showInstantiateForm && (
        <div className="modal">
          <div className="modal-content large">
            <div className="template-detail-header">
              <div>
                <h3>{selectedTemplate.name}</h3>
                <div className="template-meta">
                  <span className="template-code">{selectedTemplate.template_code}</span>
                  {selectedTemplate.industry && <span className="template-tag">{selectedTemplate.industry}</span>}
                  {selectedTemplate.project_type && <span className="template-tag">{selectedTemplate.project_type}</span>}
                </div>
              </div>
              <button className="btn-close" onClick={() => setSelectedTemplate(null)}>✕</button>
            </div>

            <div className="template-detail-body">
              {selectedTemplate.description && (
                <div className="detail-section">
                  <h4>Description</h4>
                  <p>{selectedTemplate.description}</p>
                </div>
              )}

              <div className="detail-section">
                <h4>Template Information</h4>
                <div className="info-grid">
                  {selectedTemplate.estimated_duration_days && (
                    <div className="info-item">
                      <span className="label">Estimated Duration:</span>
                      <span>{selectedTemplate.estimated_duration_days} days</span>
                    </div>
                  )}
                  {selectedTemplate.estimated_budget && (
                    <div className="info-item">
                      <span className="label">Estimated Budget:</span>
                      <span className="budget-value">${parseFloat(selectedTemplate.estimated_budget).toLocaleString()}</span>
                    </div>
                  )}
                  <div className="info-item">
                    <span className="label">Visibility:</span>
                    <span>{selectedTemplate.is_public ? 'Public' : 'Private'}</span>
                  </div>
                  {selectedTemplate.created_by_name && (
                    <div className="info-item">
                      <span className="label">Created By:</span>
                      <span>{selectedTemplate.created_by_name}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Phases */}
              {selectedTemplate.phases && selectedTemplate.phases.length > 0 && (
                <div className="detail-section">
                  <h4>Phases ({selectedTemplate.phases.length})</h4>
                  <div className="phases-preview">
                    {selectedTemplate.phases.map((phase, index) => (
                      <div key={phase.id} className="phase-preview-item">
                        <div className="phase-number">#{phase.sequence_order}</div>
                        <div className="phase-info">
                          <div className="phase-name">{phase.name}</div>
                          {phase.description && <div className="phase-desc">{phase.description}</div>}
                          <div className="phase-meta">
                            {phase.duration_days && <span>📅 {phase.duration_days} days</span>}
                            {phase.budget_percentage && <span>💰 {phase.budget_percentage}% of budget</span>}
                            {phase.gate_approval_required && <span>🚧 Gate approval required</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* WBS Elements */}
              {selectedTemplate.wbs_elements && selectedTemplate.wbs_elements.length > 0 && (
                <div className="detail-section">
                  <h4>WBS Elements ({selectedTemplate.wbs_elements.length})</h4>
                  <div className="wbs-preview">
                    {selectedTemplate.wbs_elements.map((wbs) => (
                      <div key={wbs.id} className="wbs-preview-item">
                        <div className="wbs-category">{wbs.category}</div>
                        {wbs.description && <div className="wbs-desc">{wbs.description}</div>}
                        {wbs.budget_percentage && (
                          <div className="wbs-budget">{wbs.budget_percentage}% of budget</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Milestones */}
              {selectedTemplate.milestones && selectedTemplate.milestones.length > 0 && (
                <div className="detail-section">
                  <h4>Milestones ({selectedTemplate.milestones.length})</h4>
                  <div className="milestones-preview">
                    {selectedTemplate.milestones.map((milestone) => (
                      <div key={milestone.id} className="milestone-preview-item">
                        <div className="milestone-name">
                          {milestone.name}
                          {milestone.is_critical_path && <span className="critical-indicator">🔴</span>}
                        </div>
                        {milestone.description && <div className="milestone-desc">{milestone.description}</div>}
                        <div className="milestone-meta">
                          <span>Day {milestone.days_from_start}</span>
                          <span className="milestone-type">{milestone.milestone_type}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="template-actions">
                <button
                  className="btn btn-primary btn-large"
                  onClick={() => startInstantiate(selectedTemplate)}
                >
                  Use This Template
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Instantiate Form Modal */}
      {showInstantiateForm && selectedTemplate && (
        <div className="modal">
          <div className="modal-content">
            <h3>Create Project from Template: {selectedTemplate.name}</h3>
            <form onSubmit={handleInstantiate}>
              <div className="form-group">
                <label>Project Code *</label>
                <input
                  type="text"
                  value={instantiateForm.code}
                  onChange={(e) => setInstantiateForm({ ...instantiateForm, code: e.target.value })}
                  required
                  placeholder="e.g., PROJ-2026-001"
                />
                <small>Unique identifier for the project</small>
              </div>

              <div className="form-group">
                <label>Project Name *</label>
                <input
                  type="text"
                  value={instantiateForm.name}
                  onChange={(e) => setInstantiateForm({ ...instantiateForm, name: e.target.value })}
                  required
                  placeholder="e.g., Corporate Website Redesign"
                />
              </div>

              <div className="form-group">
                <label>Description</label>
                <textarea
                  value={instantiateForm.description}
                  onChange={(e) => setInstantiateForm({ ...instantiateForm, description: e.target.value })}
                  rows="3"
                  placeholder="Brief description of the project..."
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Start Date *</label>
                  <input
                    type="date"
                    value={instantiateForm.start_date}
                    onChange={(e) => setInstantiateForm({ ...instantiateForm, start_date: e.target.value })}
                    required
                  />
                  <small>Phase and milestone dates will be calculated from this</small>
                </div>

                <div className="form-group">
                  <label>Budget ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={instantiateForm.budget}
                    onChange={(e) => setInstantiateForm({ ...instantiateForm, budget: e.target.value })}
                    placeholder="0.00"
                  />
                  <small>Template estimate: ${selectedTemplate.estimated_budget ? parseFloat(selectedTemplate.estimated_budget).toLocaleString() : 'N/A'}</small>
                </div>
              </div>

              <div className="form-group">
                <label>Project Manager</label>
                <input
                  type="text"
                  value={instantiateForm.project_manager}
                  onChange={(e) => setInstantiateForm({ ...instantiateForm, project_manager: e.target.value })}
                  placeholder="Name of project manager"
                />
              </div>

              <div className="instantiate-summary">
                <h4>What will be created:</h4>
                <ul>
                  <li>✅ Project with all template settings</li>
                  {selectedTemplate.phases && <li>✅ {selectedTemplate.phases.length} phases with calculated dates</li>}
                  {selectedTemplate.wbs_elements && <li>✅ {selectedTemplate.wbs_elements.length} WBS elements with budget allocations</li>}
                  {selectedTemplate.milestones && <li>✅ {selectedTemplate.milestones.length} milestones with planned dates</li>}
                </ul>
              </div>

              <div className="form-actions">
                <button type="submit" className="btn btn-primary">
                  Create Project
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => {
                    setShowInstantiateForm(false);
                    resetInstantiateForm();
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Templates Grid */}
      <div className="templates-grid">
        {templates.length === 0 ? (
          <div className="empty-state">
            <p>No project templates available yet.</p>
            <p>Templates allow you to standardize project creation and save time.</p>
          </div>
        ) : (
          templates.map((template) => (
            <div
              key={template.id}
              className="template-card"
              onClick={() => fetchTemplateDetails(template.id)}
            >
              <div className="template-card-header">
                <h3>{template.name}</h3>
                <span className="template-code">{template.template_code}</span>
              </div>

              {template.description && (
                <p className="template-description">
                  {template.description.length > 150
                    ? template.description.substring(0, 150) + '...'
                    : template.description}
                </p>
              )}

              <div className="template-tags">
                {template.industry && <span className="tag">{template.industry}</span>}
                {template.project_type && <span className="tag">{template.project_type}</span>}
                {template.is_public && <span className="tag public">Public</span>}
              </div>

              <div className="template-stats">
                {template.estimated_duration_days && (
                  <div className="stat">
                    <span className="stat-icon">📅</span>
                    <span className="stat-value">{template.estimated_duration_days} days</span>
                  </div>
                )}
                {template.estimated_budget && (
                  <div className="stat">
                    <span className="stat-icon">💰</span>
                    <span className="stat-value">${parseFloat(template.estimated_budget).toLocaleString()}</span>
                  </div>
                )}
              </div>

              <div className="template-footer">
                <button
                  className="btn btn-primary btn-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    startInstantiate(template);
                  }}
                >
                  Use Template
                </button>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    fetchTemplateDetails(template.id);
                  }}
                >
                  View Details
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default ProjectTemplates;

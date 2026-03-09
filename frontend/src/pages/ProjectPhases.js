import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './ProjectPhases.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

function ProjectPhases({ projectId: propProjectId, onClose }) {
  // Project selection state (for standalone page mode)
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(propProjectId || null);

  const [phases, setPhases] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showPhaseForm, setShowPhaseForm] = useState(false);
  const [showMilestoneForm, setShowMilestoneForm] = useState(false);
  const [editingPhase, setEditingPhase] = useState(null);
  const [editingMilestone, setEditingMilestone] = useState(null);

  // Use either the prop projectId or the selected one
  const projectId = propProjectId || selectedProjectId;

  // Phase form state
  const [phaseForm, setPhaseForm] = useState({
    name: '',
    description: '',
    sequence_order: 1,
    planned_start_date: '',
    planned_end_date: '',
    budget_allocation: '',
    gate_approval_required: true
  });

  // Milestone form state
  const [milestoneForm, setMilestoneForm] = useState({
    phase_id: '',
    name: '',
    description: '',
    milestone_type: 'deliverable',
    planned_date: '',
    is_critical_path: false
  });

  // Fetch projects list if in standalone mode
  useEffect(() => {
    if (!propProjectId) {
      fetchProjects();
    }
  }, [propProjectId]);

  // Fetch phases and milestones when project is selected
  useEffect(() => {
    if (projectId) {
      fetchPhases();
      fetchMilestones();
    } else {
      setLoading(false);
    }
  }, [projectId]);

  const fetchProjects = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/projects`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setProjects(Array.isArray(response.data) ? response.data : []);
      setLoading(false);
    } catch (err) {
      console.error('Failed to fetch projects:', err);
      setProjects([]);
      setLoading(false);
    }
  };

  const fetchPhases = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/project-phases/${projectId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPhases(response.data);
      setLoading(false);
    } catch (err) {
      setError('Failed to fetch phases');
      setLoading(false);
    }
  };

  const fetchMilestones = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/project-phases/milestones/${projectId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMilestones(response.data);
    } catch (err) {
      console.error('Failed to fetch milestones:', err);
    }
  };

  const handlePhaseSubmit = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');

      if (editingPhase) {
        await axios.put(
          `${API_URL}/api/project-phases/${editingPhase.id}`,
          phaseForm,
          { headers: { Authorization: `Bearer ${token}` } }
        );
      } else {
        await axios.post(
          `${API_URL}/api/project-phases`,
          { ...phaseForm, project_id: projectId },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }

      setShowPhaseForm(false);
      setEditingPhase(null);
      resetPhaseForm();
      fetchPhases();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save phase');
    }
  };

  const handleMilestoneSubmit = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');

      if (editingMilestone) {
        await axios.put(
          `${API_URL}/api/project-phases/milestones/${editingMilestone.id}`,
          milestoneForm,
          { headers: { Authorization: `Bearer ${token}` } }
        );
      } else {
        await axios.post(
          `${API_URL}/api/project-phases/milestones`,
          { ...milestoneForm, project_id: projectId },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }

      setShowMilestoneForm(false);
      setEditingMilestone(null);
      resetMilestoneForm();
      fetchMilestones();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save milestone');
    }
  };

  const handleApproveGate = async (phaseId) => {
    const decision = window.prompt('Enter decision (approved/rejected/conditional):');
    if (!decision) return;

    const notes = window.prompt('Enter gate approval notes:');

    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${API_URL}/api/project-phases/${phaseId}/approve-gate`,
        { decision, notes },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchPhases();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to approve gate');
    }
  };

  const handleDeleteMilestone = async (milestoneId) => {
    if (!window.confirm('Are you sure you want to delete this milestone?')) return;

    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API_URL}/api/project-phases/milestones/${milestoneId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchMilestones();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete milestone');
    }
  };

  const resetPhaseForm = () => {
    setPhaseForm({
      name: '',
      description: '',
      sequence_order: phases.length + 1,
      planned_start_date: '',
      planned_end_date: '',
      budget_allocation: '',
      gate_approval_required: true
    });
  };

  const resetMilestoneForm = () => {
    setMilestoneForm({
      phase_id: '',
      name: '',
      description: '',
      milestone_type: 'deliverable',
      planned_date: '',
      is_critical_path: false
    });
  };

  const editPhase = (phase) => {
    setEditingPhase(phase);
    setPhaseForm({
      name: phase.name,
      description: phase.description || '',
      sequence_order: phase.sequence_order,
      planned_start_date: phase.planned_start_date || '',
      planned_end_date: phase.planned_end_date || '',
      budget_allocation: phase.budget_allocation || '',
      gate_approval_required: phase.gate_approval_required
    });
    setShowPhaseForm(true);
  };

  const editMilestone = (milestone) => {
    setEditingMilestone(milestone);
    setMilestoneForm({
      phase_id: milestone.phase_id || '',
      name: milestone.name,
      description: milestone.description || '',
      milestone_type: milestone.milestone_type || 'deliverable',
      planned_date: milestone.planned_date || '',
      is_critical_path: milestone.is_critical_path
    });
    setShowMilestoneForm(true);
  };

  const getStatusBadge = (status) => {
    const badges = {
      not_started: { text: 'Not Started', class: 'badge-gray' },
      in_progress: { text: 'In Progress', class: 'badge-blue' },
      completed: { text: 'Completed', class: 'badge-green' },
      on_hold: { text: 'On Hold', class: 'badge-yellow' }
    };
    const badge = badges[status] || badges.not_started;
    return <span className={`badge ${badge.class}`}>{badge.text}</span>;
  };

  const getMilestoneStatusBadge = (status) => {
    const badges = {
      pending: { text: 'Pending', class: 'badge-gray' },
      achieved: { text: 'Achieved', class: 'badge-green' },
      missed: { text: 'Missed', class: 'badge-red' },
      cancelled: { text: 'Cancelled', class: 'badge-gray' }
    };
    const badge = badges[status] || badges.pending;
    return <span className={`badge ${badge.class}`}>{badge.text}</span>;
  };

  if (loading) return <div className="loading">Loading phases...</div>;

  return (
    <div className="project-phases-container">
      <div className="phases-header">
        <h2>Project Phases & Milestones</h2>
        <div className="phases-actions">
          <button className="btn btn-primary" onClick={() => { resetPhaseForm(); setShowPhaseForm(true); }}>
            + Add Phase
          </button>
          <button className="btn btn-secondary" onClick={() => { resetMilestoneForm(); setShowMilestoneForm(true); }}>
            + Add Milestone
          </button>
          {onClose && <button className="btn btn-outline" onClick={onClose}>Close</button>}
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Phase Form Modal */}
      {showPhaseForm && (
        <div className="modal">
          <div className="modal-content">
            <h3>{editingPhase ? 'Edit Phase' : 'Create Phase'}</h3>
            <form onSubmit={handlePhaseSubmit}>
              <div className="form-group">
                <label>Phase Name *</label>
                <input
                  type="text"
                  value={phaseForm.name}
                  onChange={(e) => setPhaseForm({ ...phaseForm, name: e.target.value })}
                  required
                  placeholder="e.g., Conceptual, Feasibility, Execution, Closeout"
                />
              </div>

              <div className="form-group">
                <label>Description</label>
                <textarea
                  value={phaseForm.description}
                  onChange={(e) => setPhaseForm({ ...phaseForm, description: e.target.value })}
                  rows="3"
                  placeholder="Describe this phase..."
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Sequence Order *</label>
                  <input
                    type="number"
                    value={phaseForm.sequence_order}
                    onChange={(e) => setPhaseForm({ ...phaseForm, sequence_order: parseInt(e.target.value) })}
                    min="1"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Budget Allocation</label>
                  <input
                    type="number"
                    step="0.01"
                    value={phaseForm.budget_allocation}
                    onChange={(e) => setPhaseForm({ ...phaseForm, budget_allocation: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Planned Start Date</label>
                  <input
                    type="date"
                    value={phaseForm.planned_start_date}
                    onChange={(e) => setPhaseForm({ ...phaseForm, planned_start_date: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label>Planned End Date</label>
                  <input
                    type="date"
                    value={phaseForm.planned_end_date}
                    onChange={(e) => setPhaseForm({ ...phaseForm, planned_end_date: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={phaseForm.gate_approval_required}
                    onChange={(e) => setPhaseForm({ ...phaseForm, gate_approval_required: e.target.checked })}
                  />
                  Requires Gate Approval (Go/No-Go decision)
                </label>
              </div>

              <div className="form-actions">
                <button type="submit" className="btn btn-primary">
                  {editingPhase ? 'Update Phase' : 'Create Phase'}
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => { setShowPhaseForm(false); setEditingPhase(null); }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Milestone Form Modal */}
      {showMilestoneForm && (
        <div className="modal">
          <div className="modal-content">
            <h3>{editingMilestone ? 'Edit Milestone' : 'Create Milestone'}</h3>
            <form onSubmit={handleMilestoneSubmit}>
              <div className="form-group">
                <label>Milestone Name *</label>
                <input
                  type="text"
                  value={milestoneForm.name}
                  onChange={(e) => setMilestoneForm({ ...milestoneForm, name: e.target.value })}
                  required
                  placeholder="e.g., Requirements Sign-Off"
                />
              </div>

              <div className="form-group">
                <label>Description</label>
                <textarea
                  value={milestoneForm.description}
                  onChange={(e) => setMilestoneForm({ ...milestoneForm, description: e.target.value })}
                  rows="2"
                  placeholder="Describe this milestone..."
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Phase</label>
                  <select
                    value={milestoneForm.phase_id}
                    onChange={(e) => setMilestoneForm({ ...milestoneForm, phase_id: e.target.value })}
                  >
                    <option value="">No Phase</option>
                    {phases.map(phase => (
                      <option key={phase.id} value={phase.id}>{phase.name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Type</label>
                  <select
                    value={milestoneForm.milestone_type}
                    onChange={(e) => setMilestoneForm({ ...milestoneForm, milestone_type: e.target.value })}
                  >
                    <option value="deliverable">Deliverable</option>
                    <option value="decision_point">Decision Point</option>
                    <option value="approval">Approval</option>
                    <option value="payment">Payment</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Planned Date *</label>
                <input
                  type="date"
                  value={milestoneForm.planned_date}
                  onChange={(e) => setMilestoneForm({ ...milestoneForm, planned_date: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={milestoneForm.is_critical_path}
                    onChange={(e) => setMilestoneForm({ ...milestoneForm, is_critical_path: e.target.checked })}
                  />
                  Critical Path Milestone
                </label>
              </div>

              <div className="form-actions">
                <button type="submit" className="btn btn-primary">
                  {editingMilestone ? 'Update Milestone' : 'Create Milestone'}
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => { setShowMilestoneForm(false); setEditingMilestone(null); }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Phases List */}
      <div className="phases-list">
        <h3>Phases ({phases.length})</h3>
        {phases.length === 0 ? (
          <p className="empty-state">No phases yet. Create your first phase to organize the project.</p>
        ) : (
          <div className="phases-timeline">
            {phases.map((phase) => (
              <div key={phase.id} className="phase-card">
                <div className="phase-header">
                  <div className="phase-title">
                    <span className="phase-number">#{phase.sequence_order}</span>
                    <h4>{phase.name}</h4>
                    {getStatusBadge(phase.status)}
                  </div>
                  <div className="phase-actions">
                    <button className="btn-icon" onClick={() => editPhase(phase)} title="Edit">✏️</button>
                    {phase.gate_approval_required && !phase.gate_decision && (
                      <button className="btn btn-sm" onClick={() => handleApproveGate(phase.id)}>
                        Approve Gate
                      </button>
                    )}
                  </div>
                </div>

                {phase.description && <p className="phase-description">{phase.description}</p>}

                <div className="phase-details">
                  <div className="detail-item">
                    <span className="label">Planned:</span>
                    <span>
                      {phase.planned_start_date || 'N/A'} → {phase.planned_end_date || 'N/A'}
                    </span>
                  </div>
                  {phase.budget_allocation && (
                    <div className="detail-item">
                      <span className="label">Budget:</span>
                      <span>${parseFloat(phase.budget_allocation).toLocaleString()}</span>
                    </div>
                  )}
                  {phase.gate_decision && (
                    <div className="detail-item">
                      <span className="label">Gate Decision:</span>
                      <span className={`gate-decision gate-${phase.gate_decision}`}>
                        {phase.gate_decision}
                      </span>
                    </div>
                  )}
                  {phase.gate_approved_by_name && (
                    <div className="detail-item">
                      <span className="label">Approved by:</span>
                      <span>{phase.gate_approved_by_name}</span>
                    </div>
                  )}
                </div>

                {phase.gate_notes && (
                  <div className="phase-notes">
                    <strong>Gate Notes:</strong> {phase.gate_notes}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Milestones List */}
      <div className="milestones-list">
        <h3>Milestones ({milestones.length})</h3>
        {milestones.length === 0 ? (
          <p className="empty-state">No milestones yet. Add milestones to track key deliverables.</p>
        ) : (
          <div className="milestones-grid">
            {milestones.map((milestone) => (
              <div key={milestone.id} className={`milestone-card ${milestone.is_critical_path ? 'critical' : ''}`}>
                <div className="milestone-header">
                  <div>
                    <h4>{milestone.name}</h4>
                    {milestone.is_critical_path && <span className="critical-badge">🔴 Critical Path</span>}
                  </div>
                  <div className="milestone-actions">
                    <button className="btn-icon" onClick={() => editMilestone(milestone)} title="Edit">✏️</button>
                    <button className="btn-icon" onClick={() => handleDeleteMilestone(milestone.id)} title="Delete">🗑️</button>
                  </div>
                </div>

                {milestone.description && <p className="milestone-description">{milestone.description}</p>}

                <div className="milestone-details">
                  {milestone.phase_name && (
                    <div className="detail-item">
                      <span className="label">Phase:</span>
                      <span>{milestone.phase_name}</span>
                    </div>
                  )}
                  <div className="detail-item">
                    <span className="label">Type:</span>
                    <span className="milestone-type">{milestone.milestone_type}</span>
                  </div>
                  <div className="detail-item">
                    <span className="label">Planned:</span>
                    <span>{milestone.planned_date}</span>
                  </div>
                  {milestone.actual_date && (
                    <div className="detail-item">
                      <span className="label">Actual:</span>
                      <span>{milestone.actual_date}</span>
                    </div>
                  )}
                  <div className="detail-item">
                    <span className="label">Status:</span>
                    {getMilestoneStatusBadge(milestone.status)}
                  </div>
                  {milestone.completion_percentage !== null && (
                    <div className="detail-item">
                      <span className="label">Progress:</span>
                      <div className="progress-bar">
                        <div
                          className="progress-fill"
                          style={{ width: `${milestone.completion_percentage}%` }}
                        >
                          {milestone.completion_percentage}%
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default ProjectPhases;

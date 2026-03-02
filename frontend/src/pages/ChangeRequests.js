import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './ChangeRequests.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

function ChangeRequests({ projectId, onClose }) {
  const [changeRequests, setChangeRequests] = useState([]);
  const [selectedCR, setSelectedCR] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [userRole, setUserRole] = useState('');

  const [form, setForm] = useState({
    title: '',
    description: '',
    change_type: 'scope',
    change_category: 'enhancement',
    impact_scope: '',
    impact_schedule: '',
    impact_budget: '',
    impact_resources: '',
    impact_quality: '',
    impact_risk: '',
    estimated_cost: '',
    cost_benefit_analysis: '',
    priority: 'medium'
  });

  useEffect(() => {
    fetchChangeRequests();
    const role = localStorage.getItem('role');
    setUserRole(role);
  }, [projectId]);

  const fetchChangeRequests = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/change-requests/project/${projectId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setChangeRequests(response.data);
      setLoading(false);
    } catch (err) {
      setError('Failed to fetch change requests');
      setLoading(false);
    }
  };

  const fetchCRDetails = async (crId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/change-requests/${crId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSelectedCR(response.data);
    } catch (err) {
      setError('Failed to fetch change request details');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${API_URL}/api/change-requests`,
        { ...form, project_id: projectId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setShowForm(false);
      resetForm();
      fetchChangeRequests();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit change request');
    }
  };

  const handleReview = async (crId, decision) => {
    const comments = window.prompt(`Enter comments for ${decision}:`);
    if (!comments) return;

    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${API_URL}/api/change-requests/${crId}/review`,
        { decision, comments },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchChangeRequests();
      if (selectedCR && selectedCR.id === crId) {
        fetchCRDetails(crId);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to review change request');
    }
  };

  const handleImplement = async (crId) => {
    const notes = window.prompt('Enter implementation notes:');

    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${API_URL}/api/change-requests/${crId}/implement`,
        { implementation_notes: notes },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchChangeRequests();
      if (selectedCR && selectedCR.id === crId) {
        fetchCRDetails(crId);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to implement change request');
    }
  };

  const resetForm = () => {
    setForm({
      title: '',
      description: '',
      change_type: 'scope',
      change_category: 'enhancement',
      impact_scope: '',
      impact_schedule: '',
      impact_budget: '',
      impact_resources: '',
      impact_quality: '',
      impact_risk: '',
      estimated_cost: '',
      cost_benefit_analysis: '',
      priority: 'medium'
    });
  };

  const getStatusBadge = (status) => {
    const badges = {
      submitted: { text: 'Submitted', class: 'badge-blue' },
      under_review: { text: 'Under Review', class: 'badge-yellow' },
      approved: { text: 'Approved', class: 'badge-green' },
      rejected: { text: 'Rejected', class: 'badge-red' },
      implemented: { text: 'Implemented', class: 'badge-purple' },
      cancelled: { text: 'Cancelled', class: 'badge-gray' }
    };
    const badge = badges[status] || badges.submitted;
    return <span className={`badge ${badge.class}`}>{badge.text}</span>;
  };

  const getPriorityBadge = (priority) => {
    const badges = {
      low: { text: 'Low', class: 'priority-low' },
      medium: { text: 'Medium', class: 'priority-medium' },
      high: { text: 'High', class: 'priority-high' },
      critical: { text: 'Critical', class: 'priority-critical' }
    };
    const badge = badges[priority] || badges.medium;
    return <span className={`priority-badge ${badge.class}`}>{badge.text}</span>;
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  if (loading) return <div className="loading">Loading change requests...</div>;

  return (
    <div className="change-requests-container">
      <div className="cr-header">
        <h2>Change Request Management</h2>
        <div className="cr-actions">
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            + Submit Change Request
          </button>
          {onClose && <button className="btn btn-outline" onClick={onClose}>Close</button>}
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Change Request Form Modal */}
      {showForm && (
        <div className="modal">
          <div className="modal-content large">
            <h3>Submit Change Request</h3>
            <form onSubmit={handleSubmit}>
              {/* Basic Information */}
              <div className="form-section">
                <h4>Basic Information</h4>
                <div className="form-group">
                  <label>Title *</label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    required
                    placeholder="Brief title for the change request"
                  />
                </div>

                <div className="form-group">
                  <label>Description *</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    required
                    rows="4"
                    placeholder="Detailed description of the requested change..."
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Change Type *</label>
                    <select
                      value={form.change_type}
                      onChange={(e) => setForm({ ...form, change_type: e.target.value })}
                      required
                    >
                      <option value="scope">Scope</option>
                      <option value="schedule">Schedule</option>
                      <option value="budget">Budget</option>
                      <option value="resources">Resources</option>
                      <option value="quality">Quality</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Category</label>
                    <select
                      value={form.change_category}
                      onChange={(e) => setForm({ ...form, change_category: e.target.value })}
                    >
                      <option value="enhancement">Enhancement</option>
                      <option value="defect_fix">Defect Fix</option>
                      <option value="requirement_change">Requirement Change</option>
                      <option value="risk_mitigation">Risk Mitigation</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Priority</label>
                    <select
                      value={form.priority}
                      onChange={(e) => setForm({ ...form, priority: e.target.value })}
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Impact Analysis */}
              <div className="form-section">
                <h4>Impact Analysis</h4>
                <div className="form-group">
                  <label>Impact on Scope</label>
                  <textarea
                    value={form.impact_scope}
                    onChange={(e) => setForm({ ...form, impact_scope: e.target.value })}
                    rows="2"
                    placeholder="How does this affect project scope?"
                  />
                </div>

                <div className="form-group">
                  <label>Impact on Schedule</label>
                  <textarea
                    value={form.impact_schedule}
                    onChange={(e) => setForm({ ...form, impact_schedule: e.target.value })}
                    rows="2"
                    placeholder="How does this affect timeline?"
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Budget Impact ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={form.impact_budget}
                      onChange={(e) => setForm({ ...form, impact_budget: e.target.value })}
                      placeholder="Positive = increase, Negative = decrease"
                    />
                  </div>

                  <div className="form-group">
                    <label>Estimated Cost ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={form.estimated_cost}
                      onChange={(e) => setForm({ ...form, estimated_cost: e.target.value })}
                      placeholder="Total cost to implement"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Impact on Resources</label>
                  <textarea
                    value={form.impact_resources}
                    onChange={(e) => setForm({ ...form, impact_resources: e.target.value })}
                    rows="2"
                    placeholder="Resource implications (team members, equipment, etc.)"
                  />
                </div>

                <div className="form-group">
                  <label>Impact on Quality</label>
                  <textarea
                    value={form.impact_quality}
                    onChange={(e) => setForm({ ...form, impact_quality: e.target.value })}
                    rows="2"
                    placeholder="How does this affect quality?"
                  />
                </div>

                <div className="form-group">
                  <label>Risk Assessment</label>
                  <textarea
                    value={form.impact_risk}
                    onChange={(e) => setForm({ ...form, impact_risk: e.target.value })}
                    rows="2"
                    placeholder="Risk analysis and mitigation"
                  />
                </div>

                <div className="form-group">
                  <label>Cost-Benefit Analysis</label>
                  <textarea
                    value={form.cost_benefit_analysis}
                    onChange={(e) => setForm({ ...form, cost_benefit_analysis: e.target.value })}
                    rows="3"
                    placeholder="Justify the change with expected benefits vs. costs..."
                  />
                </div>
              </div>

              <div className="form-actions">
                <button type="submit" className="btn btn-primary">Submit Change Request</button>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => { setShowForm(false); resetForm(); }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Change Request Details Modal */}
      {selectedCR && (
        <div className="modal">
          <div className="modal-content large">
            <div className="cr-detail-header">
              <div>
                <h3>{selectedCR.change_number}: {selectedCR.title}</h3>
                <div className="cr-meta">
                  {getStatusBadge(selectedCR.status)}
                  {getPriorityBadge(selectedCR.priority)}
                  <span className="cr-type">{selectedCR.change_type}</span>
                </div>
              </div>
              <button className="btn-close" onClick={() => setSelectedCR(null)}>✕</button>
            </div>

            <div className="cr-detail-body">
              <div className="detail-section">
                <h4>Description</h4>
                <p>{selectedCR.description}</p>
              </div>

              <div className="detail-section">
                <h4>Request Information</h4>
                <div className="info-grid">
                  <div className="info-item">
                    <span className="label">Requested By:</span>
                    <span>{selectedCR.requested_by_name}</span>
                  </div>
                  <div className="info-item">
                    <span className="label">Requested Date:</span>
                    <span>{selectedCR.requested_date}</span>
                  </div>
                  <div className="info-item">
                    <span className="label">Category:</span>
                    <span>{selectedCR.change_category}</span>
                  </div>
                  {selectedCR.estimated_cost > 0 && (
                    <div className="info-item">
                      <span className="label">Estimated Cost:</span>
                      <span className="cost">{formatCurrency(selectedCR.estimated_cost)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Impact Analysis */}
              <div className="detail-section">
                <h4>Impact Analysis</h4>
                <div className="impact-grid">
                  {selectedCR.impact_scope && (
                    <div className="impact-item">
                      <strong>Scope:</strong>
                      <p>{selectedCR.impact_scope}</p>
                    </div>
                  )}
                  {selectedCR.impact_schedule && (
                    <div className="impact-item">
                      <strong>Schedule:</strong>
                      <p>{selectedCR.impact_schedule}</p>
                    </div>
                  )}
                  {selectedCR.impact_budget && (
                    <div className="impact-item">
                      <strong>Budget:</strong>
                      <p className={selectedCR.impact_budget > 0 ? 'budget-increase' : 'budget-decrease'}>
                        {formatCurrency(selectedCR.impact_budget)}
                      </p>
                    </div>
                  )}
                  {selectedCR.impact_resources && (
                    <div className="impact-item">
                      <strong>Resources:</strong>
                      <p>{selectedCR.impact_resources}</p>
                    </div>
                  )}
                  {selectedCR.impact_quality && (
                    <div className="impact-item">
                      <strong>Quality:</strong>
                      <p>{selectedCR.impact_quality}</p>
                    </div>
                  )}
                  {selectedCR.impact_risk && (
                    <div className="impact-item">
                      <strong>Risk:</strong>
                      <p>{selectedCR.impact_risk}</p>
                    </div>
                  )}
                </div>

                {selectedCR.cost_benefit_analysis && (
                  <div className="cost-benefit">
                    <strong>Cost-Benefit Analysis:</strong>
                    <p>{selectedCR.cost_benefit_analysis}</p>
                  </div>
                )}
              </div>

              {/* Approvals */}
              {selectedCR.approvals && selectedCR.approvals.length > 0 && (
                <div className="detail-section">
                  <h4>Approval Workflow</h4>
                  <div className="approvals-list">
                    {selectedCR.approvals.map((approval) => (
                      <div key={approval.id} className="approval-item">
                        <div className="approval-level">Level {approval.approval_level}</div>
                        <div className="approval-info">
                          <div className="approver-name">{approval.approver_name}</div>
                          <div className="approval-status">
                            {approval.approval_status === 'approved' && '✅ Approved'}
                            {approval.approval_status === 'rejected' && '❌ Rejected'}
                            {approval.approval_status === 'pending' && '⏳ Pending'}
                          </div>
                          {approval.approval_date && (
                            <div className="approval-date">{new Date(approval.approval_date).toLocaleDateString()}</div>
                          )}
                          {approval.comments && (
                            <div className="approval-comments">{approval.comments}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Review/Approval */}
              {selectedCR.reviewed_by_name && (
                <div className="detail-section">
                  <h4>Review</h4>
                  <p><strong>Reviewed by:</strong> {selectedCR.reviewed_by_name}</p>
                  {selectedCR.reviewed_at && <p><strong>Date:</strong> {new Date(selectedCR.reviewed_at).toLocaleString()}</p>}
                  {selectedCR.rejection_reason && (
                    <div className="rejection-reason">
                      <strong>Rejection Reason:</strong>
                      <p>{selectedCR.rejection_reason}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Implementation */}
              {selectedCR.status === 'implemented' && (
                <div className="detail-section">
                  <h4>Implementation</h4>
                  <p><strong>Implemented by:</strong> {selectedCR.implemented_by_name || 'N/A'}</p>
                  <p><strong>Date:</strong> {selectedCR.implementation_date}</p>
                  {selectedCR.implementation_notes && (
                    <p><strong>Notes:</strong> {selectedCR.implementation_notes}</p>
                  )}
                </div>
              )}

              {/* Actions */}
              {userRole && ['manager', 'admin'].includes(userRole) && (
                <div className="cr-actions-section">
                  {selectedCR.status === 'submitted' && (
                    <>
                      <button
                        className="btn btn-success"
                        onClick={() => handleReview(selectedCR.id, 'approved')}
                      >
                        Approve
                      </button>
                      <button
                        className="btn btn-danger"
                        onClick={() => handleReview(selectedCR.id, 'rejected')}
                      >
                        Reject
                      </button>
                    </>
                  )}
                  {selectedCR.status === 'approved' && (
                    <button
                      className="btn btn-primary"
                      onClick={() => handleImplement(selectedCR.id)}
                    >
                      Mark as Implemented
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Change Requests List */}
      <div className="cr-list">
        {changeRequests.length === 0 ? (
          <p className="empty-state">No change requests yet. Submit your first change request.</p>
        ) : (
          <div className="cr-grid">
            {changeRequests.map((cr) => (
              <div key={cr.id} className="cr-card" onClick={() => fetchCRDetails(cr.id)}>
                <div className="cr-card-header">
                  <div className="cr-number">{cr.change_number}</div>
                  {getStatusBadge(cr.status)}
                </div>
                <h4>{cr.title}</h4>
                <p className="cr-description">{cr.description.substring(0, 150)}...</p>
                <div className="cr-card-footer">
                  <div className="cr-meta-item">
                    <span className="meta-label">Type:</span>
                    <span className="meta-value">{cr.change_type}</span>
                  </div>
                  <div className="cr-meta-item">
                    <span className="meta-label">Priority:</span>
                    {getPriorityBadge(cr.priority)}
                  </div>
                  {cr.estimated_cost > 0 && (
                    <div className="cr-meta-item">
                      <span className="meta-label">Cost:</span>
                      <span className="meta-value cost">{formatCurrency(cr.estimated_cost)}</span>
                    </div>
                  )}
                  <div className="cr-meta-item">
                    <span className="meta-label">Requested by:</span>
                    <span className="meta-value">{cr.requested_by_name}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default ChangeRequests;

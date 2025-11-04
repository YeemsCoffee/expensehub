import React, { useState, useEffect } from 'react';
import { 
  Plus, Trash2, Edit2, Save, X, 
  DollarSign, Users, ArrowRight, GripVertical,
  AlertCircle, CheckCircle
} from 'lucide-react';
import api from '../services/api';
import { useToast } from '../components/Toast';

const ApprovalFlows = () => {
  const toast = useToast();
  const [approvalFlows, setApprovalFlows] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingFlow, setEditingFlow] = useState(null);
  
  // Form state for creating/editing flows
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    minAmount: 0,
    maxAmount: null,
    costCenterId: null,
    isActive: true,
    levels: [] // Array of arrays - each level contains multiple user IDs
  });

  // State for adding approvers
  const [selectedLevel, setSelectedLevel] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [flowsRes, usersRes] = await Promise.all([
        api.get('/approval-flows'),
        api.get('/users')
      ]);
      
      setApprovalFlows(flowsRes.data);
      // Show all users - any role can be an approver
      setUsers(usersRes.data);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching data:', err);
      toast.error('Failed to load approval flows');
      setLoading(false);
    }
  };

  const handleOpenModal = (flow = null) => {
    if (flow) {
      setEditingFlow(flow);
      setFormData({
        name: flow.name,
        description: flow.description || '',
        minAmount: flow.min_amount,
        maxAmount: flow.max_amount,
        costCenterId: flow.cost_center_id,
        isActive: flow.is_active,
        levels: flow.levels || []
      });
    } else {
      setEditingFlow(null);
      setFormData({
        name: '',
        description: '',
        minAmount: 0,
        maxAmount: null,
        costCenterId: null,
        isActive: true,
        levels: [[]] // Start with one empty level
      });
    }
    setSelectedLevel(null);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingFlow(null);
    setSelectedLevel(null);
    setFormData({
      name: '',
      description: '',
      minAmount: 0,
      maxAmount: null,
      costCenterId: null,
      isActive: true,
      levels: []
    });
  };

  const handleAddLevel = () => {
    setFormData({
      ...formData,
      levels: [...formData.levels, []]
    });
  };

  const handleRemoveLevel = (levelIndex) => {
    const newLevels = formData.levels.filter((_, idx) => idx !== levelIndex);
    setFormData({
      ...formData,
      levels: newLevels
    });
  };

  const handleAddApproverToLevel = (levelIndex, userId) => {
    const newLevels = formData.levels.map((level, idx) => {
      if (idx === levelIndex) {
        // Check if user is already in this level
        if (level.includes(userId)) return level;
        return [...level, userId];
      }
      return level;
    });
    setFormData({
      ...formData,
      levels: newLevels
    });
  };

  const handleRemoveApproverFromLevel = (levelIndex, userId) => {
    const newLevels = formData.levels.map((level, idx) => {
      if (idx === levelIndex) {
        return level.filter(id => id !== userId);
      }
      return level;
    });
    setFormData({
      ...formData,
      levels: newLevels
    });
  };

  // Check if user is already in any level
  const isUserInFlow = (userId) => {
    return formData.levels.some(level => level.includes(userId));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validation
    if (!formData.name) {
      toast.error('Please enter a flow name');
      return;
    }

    if (formData.levels.length === 0) {
      toast.error('Please add at least one approval level');
      return;
    }

    // Check that each level has at least one approver
    const hasEmptyLevel = formData.levels.some(level => level.length === 0);
    if (hasEmptyLevel) {
      toast.error('Each approval level must have at least one approver');
      return;
    }

    if (formData.maxAmount !== null && formData.minAmount >= formData.maxAmount) {
      toast.error('Maximum amount must be greater than minimum amount');
      return;
    }

    try {
      const payload = {
        name: formData.name,
        description: formData.description,
        minAmount: parseFloat(formData.minAmount),
        maxAmount: formData.maxAmount ? parseFloat(formData.maxAmount) : null,
        costCenterId: formData.costCenterId,
        isActive: formData.isActive,
        levels: formData.levels
      };

      if (editingFlow) {
        await api.put(`/approval-flows/${editingFlow.id}`, payload);
        toast.success('Approval flow updated successfully');
      } else {
        await api.post('/approval-flows', payload);
        toast.success('Approval flow created successfully');
      }

      fetchData();
      handleCloseModal();
    } catch (err) {
      console.error('Error saving approval flow:', err);
      toast.error(err.response?.data?.error || 'Failed to save approval flow');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this approval flow?')) {
      return;
    }

    try {
      await api.delete(`/approval-flows/${id}`);
      toast.success('Approval flow deleted');
      fetchData();
    } catch (err) {
      console.error('Error deleting approval flow:', err);
      toast.error('Failed to delete approval flow');
    }
  };

  const handleToggleActive = async (flow) => {
    try {
      await api.put(`/approval-flows/${flow.id}`, {
        ...flow,
        isActive: !flow.is_active
      });
      toast.success(`Approval flow ${!flow.is_active ? 'activated' : 'deactivated'}`);
      fetchData();
    } catch (err) {
      console.error('Error toggling flow:', err);
      toast.error('Failed to update approval flow');
    }
  };

  const getUserById = (userId) => {
    return users.find(u => u.id === userId);
  };

  const formatAmount = (amount) => {
    if (amount === null || amount === undefined) return '∞';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="page-title">
        <div className="loading-spinner"></div>
        Loading approval flows...
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h2 className="page-title" style={{ marginBottom: '0.5rem' }}>Approval Flows</h2>
          <p className="text-gray-600">Configure multi-level approval workflows based on expense amounts</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="btn btn-primary"
        >
          <Plus size={20} />
          New Approval Flow
        </button>
      </div>

      {/* Approval Flows List */}
      <div className="card">
        <h3 className="card-title">Active Approval Flows ({approvalFlows.filter(f => f.is_active).length})</h3>
        
        {approvalFlows.length === 0 ? (
          <div className="empty-state">
            <AlertCircle size={48} style={{ color: '#9ca3af', marginBottom: '1rem' }} />
            <h3>No approval flows configured</h3>
            <p>Create your first approval flow to automate expense approvals</p>
            <button onClick={() => handleOpenModal()} className="btn btn-primary" style={{ marginTop: '1rem' }}>
              <Plus size={20} />
              Create Approval Flow
            </button>
          </div>
        ) : (
          <div className="approval-flows-grid">
            {approvalFlows.map((flow) => (
              <div 
                key={flow.id} 
                className={`approval-flow-card ${!flow.is_active ? 'inactive' : ''}`}
              >
                <div className="approval-flow-header">
                  <div>
                    <h4>{flow.name}</h4>
                    {flow.description && (
                      <p className="text-gray-600 text-sm">{flow.description}</p>
                    )}
                  </div>
                  <div className="approval-flow-actions">
                    <button
                      onClick={() => handleToggleActive(flow)}
                      className={`btn btn-sm ${flow.is_active ? 'btn-secondary' : 'btn-primary'}`}
                      title={flow.is_active ? 'Deactivate' : 'Activate'}
                    >
                      {flow.is_active ? 'Active' : 'Inactive'}
                    </button>
                    <button
                      onClick={() => handleOpenModal(flow)}
                      className="btn btn-sm btn-secondary"
                      title="Edit"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(flow.id)}
                      className="btn btn-sm btn-danger"
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                <div className="approval-flow-details">
                  <div className="approval-flow-amount">
                    <DollarSign size={16} />
                    <span>
                      {formatAmount(flow.min_amount)} - {formatAmount(flow.max_amount)}
                    </span>
                  </div>

                  {flow.cost_center_id && (
                    <div className="approval-flow-scope">
                      <span className="badge badge-info">
                        Cost Center: {flow.cost_center_code}
                      </span>
                    </div>
                  )}
                </div>

                <div className="approval-chain">
                  <div className="approval-chain-label">Approval Chain:</div>
                  <div className="approval-chain-steps">
                    {flow.levels && flow.levels.map((level, levelIndex) => {
                      return (
                        <React.Fragment key={levelIndex}>
                          {levelIndex > 0 && <ArrowRight size={16} className="approval-arrow" />}
                          <div className="approval-step">
                            <div className="approval-step-level">Level {levelIndex + 1}</div>
                            <div className="approval-step-approvers">
                              {level.map((approverId, approverIndex) => {
                                const approver = getUserById(approverId);
                                return (
                                  <div key={approverId} className="approver-badge">
                                    <Users size={12} />
                                    <span>
                                      {approver ? `${approver.first_name} ${approver.last_name}` : 'Unknown'}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal for Create/Edit */}
      {showModal && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingFlow ? 'Edit Approval Flow' : 'Create New Approval Flow'}</h3>
              <button onClick={handleCloseModal} className="modal-close">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {/* Basic Info */}
                <div className="form-section">
                  <h4 className="form-section-title">Basic Information</h4>
                  
                  <div className="form-group">
                    <label className="form-label">Flow Name *</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g., Manager Approval ($500-$2,500)"
                      className="form-input"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Description</label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Optional description of when this flow applies"
                      className="form-input"
                      rows="2"
                    />
                  </div>
                </div>

                {/* Amount Thresholds */}
                <div className="form-section">
                  <h4 className="form-section-title">Amount Thresholds</h4>
                  
                  <div className="form-grid">
                    <div className="form-group">
                      <label className="form-label">Minimum Amount ($) *</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.minAmount}
                        onChange={(e) => setFormData({ ...formData, minAmount: e.target.value })}
                        placeholder="0.00"
                        className="form-input"
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Maximum Amount ($)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.maxAmount || ''}
                        onChange={(e) => setFormData({ ...formData, maxAmount: e.target.value || null })}
                        placeholder="Leave empty for unlimited"
                        className="form-input"
                      />
                      <p className="form-hint">Leave empty for no upper limit</p>
                    </div>
                  </div>

                  <div className="info-box">
                    <AlertCircle size={16} />
                    <span>
                      This flow will apply to expenses between {formatAmount(formData.minAmount)} and {formatAmount(formData.maxAmount)}
                    </span>
                  </div>
                </div>

                {/* Approval Chain - Levels */}
                <div className="form-section">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h4 className="form-section-title" style={{ marginBottom: 0 }}>Approval Levels</h4>
                    <button
                      type="button"
                      onClick={handleAddLevel}
                      className="btn btn-sm btn-primary"
                    >
                      <Plus size={16} />
                      Add Level
                    </button>
                  </div>

                  {formData.levels.length === 0 ? (
                    <div className="empty-approvers">
                      <Users size={32} style={{ color: '#9ca3af', marginBottom: '0.5rem' }} />
                      <p>No approval levels yet</p>
                      <p className="text-sm text-gray-600">Click "Add Level" to create your first approval level</p>
                    </div>
                  ) : (
                    <div className="levels-builder">
                      {formData.levels.map((level, levelIndex) => (
                        <div key={levelIndex} className="level-card">
                          <div className="level-header">
                            <div className="level-title">
                              <div className="level-badge">Level {levelIndex + 1}</div>
                              <span className="text-sm text-gray-600">
                                {level.length} approver{level.length !== 1 ? 's' : ''}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveLevel(levelIndex)}
                              className="btn btn-sm btn-danger"
                              title="Remove Level"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>

                          <div className="level-approvers">
                            {level.length === 0 ? (
                              <p className="text-sm text-gray-600">No approvers in this level yet</p>
                            ) : (
                              <div className="approver-chips">
                                {level.map(approverId => {
                                  const approver = getUserById(approverId);
                                  return (
                                    <div key={approverId} className="approver-chip">
                                      <Users size={14} />
                                      <span>{approver ? `${approver.first_name} ${approver.last_name}` : 'Unknown'}</span>
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveApproverFromLevel(levelIndex, approverId)}
                                        className="chip-remove"
                                      >
                                        <X size={14} />
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          <div className="level-actions">
                            <label className="form-label text-sm">Add approver to Level {levelIndex + 1}:</label>
                            <div className="approver-select-list">
                              {users
                                .filter(user => !level.includes(user.id))
                                .map(user => (
                                  <button
                                    key={user.id}
                                    type="button"
                                    onClick={() => handleAddApproverToLevel(levelIndex, user.id)}
                                    className="approver-select-option"
                                  >
                                    <div>
                                      <strong>{user.first_name} {user.last_name}</strong>
                                      <span className="text-sm text-gray-600">{user.email}</span>
                                    </div>
                                    <span className={`badge ${user.role === 'admin' ? 'badge-danger' : 'badge-warning'}`}>
                                      {user.role}
                                    </span>
                                  </button>
                                ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="info-box" style={{ marginTop: '1rem' }}>
                    <AlertCircle size={16} />
                    <span>
                      You can add multiple approvers to the same level. All approvers at a level can approve expenses independently.
                    </span>
                  </div>
                </div>

                {/* Status */}
                <div className="form-section">
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="checkbox"
                      checked={formData.isActive}
                      onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    />
                    Active (Enable this approval flow immediately)
                  </label>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" onClick={handleCloseModal} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  <Save size={18} />
                  {editingFlow ? 'Update Flow' : 'Create Flow'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style jsx>{`
        .approval-flows-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
          gap: 1.5rem;
          margin-top: 1.5rem;
        }

        .approval-flow-card {
          border: 2px solid #e5e7eb;
          border-radius: 8px;
          padding: 1.5rem;
          background: white;
          transition: all 0.2s;
        }

        .approval-flow-card:hover {
          border-color: #6366f1;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }

        .approval-flow-card.inactive {
          opacity: 0.6;
          background: #f9fafb;
        }

        .approval-flow-header {
          display: flex;
          justify-content: space-between;
          align-items: start;
          margin-bottom: 1rem;
        }

        .approval-flow-header h4 {
          margin: 0 0 0.25rem 0;
          font-size: 1.125rem;
          font-weight: 600;
        }

        .approval-flow-actions {
          display: flex;
          gap: 0.5rem;
        }

        .approval-flow-details {
          display: flex;
          gap: 1rem;
          margin-bottom: 1rem;
          padding-bottom: 1rem;
          border-bottom: 1px solid #e5e7eb;
        }

        .approval-flow-amount {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: #10b981;
          font-weight: 600;
        }

        .approval-chain {
          margin-top: 1rem;
        }

        .approval-chain-label {
          font-size: 0.875rem;
          font-weight: 600;
          color: #6b7280;
          margin-bottom: 0.5rem;
        }

        .approval-chain-steps {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 0.5rem;
        }

        .approval-step {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          padding: 0.75rem;
          background: #f3f4f6;
          border-radius: 6px;
          font-size: 0.875rem;
        }

        .approval-step-level {
          font-size: 0.75rem;
          font-weight: 600;
          color: #6366f1;
          margin-bottom: 0.25rem;
        }

        .approval-step-approvers {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .approver-badge {
          display: flex;
          align-items: center;
          gap: 0.375rem;
          font-size: 0.75rem;
          color: #4b5563;
        }

        .approval-arrow {
          color: #9ca3af;
        }

        .levels-builder {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .level-card {
          border: 2px solid #e5e7eb;
          border-radius: 8px;
          padding: 1rem;
          background: #f9fafb;
        }

        .level-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
          padding-bottom: 0.75rem;
          border-bottom: 1px solid #e5e7eb;
        }

        .level-title {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .level-badge {
          font-size: 0.875rem;
          font-weight: 600;
          color: #6366f1;
          background: #eff6ff;
          padding: 0.375rem 0.75rem;
          border-radius: 4px;
        }

        .level-approvers {
          margin-bottom: 1rem;
          min-height: 40px;
        }

        .approver-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }

        .approver-chip {
          display: flex;
          align-items: center;
          gap: 0.375rem;
          padding: 0.375rem 0.625rem;
          background: white;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 0.875rem;
        }

        .chip-remove {
          background: none;
          border: none;
          cursor: pointer;
          color: #9ca3af;
          padding: 0;
          display: flex;
          align-items: center;
          margin-left: 0.25rem;
        }

        .chip-remove:hover {
          color: #ef4444;
        }

        .level-actions {
          background: white;
          padding: 0.75rem;
          border-radius: 6px;
        }

        .approver-select-list {
          display: flex;
          flex-direction: column;
          gap: 0.375rem;
          max-height: 150px;
          overflow-y: auto;
          margin-top: 0.5rem;
        }

        .approver-select-option {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.625rem;
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
          text-align: left;
        }

        .approver-select-option:hover {
          border-color: #6366f1;
          background: #eff6ff;
        }

        .approver-select-option div {
          display: flex;
          flex-direction: column;
          align-items: start;
          gap: 0.25rem;
        }

        .empty-approvers {
          text-align: center;
          padding: 2rem;
          background: #f9fafb;
          border: 2px dashed #e5e7eb;
          border-radius: 8px;
          margin-bottom: 1.5rem;
        }

        .info-box {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem 1rem;
          background: #eff6ff;
          border: 1px solid #bfdbfe;
          border-radius: 6px;
          color: #1e40af;
          font-size: 0.875rem;
        }

        .form-section {
          margin-bottom: 2rem;
        }

        .form-section-title {
          font-size: 1rem;
          font-weight: 600;
          margin-bottom: 1rem;
          padding-bottom: 0.5rem;
          border-bottom: 2px solid #e5e7eb;
        }

        .modal-large {
          max-width: 800px;
          max-height: 90vh;
          overflow-y: auto;
        }

        .loading-spinner {
          display: inline-block;
          width: 20px;
          height: 20px;
          border: 3px solid #f3f4f6;
          border-top-color: #6366f1;
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
          margin-right: 0.5rem;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        @media (max-width: 768px) {
          .approval-flows-grid {
            grid-template-columns: 1fr;
          }
          
          .modal-large {
            max-width: 100%;
            margin: 0;
            border-radius: 0;
          }
        }
      `}</style>
    </div>
  );
};

export default ApprovalFlows;
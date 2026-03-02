import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './AuditTrail.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

function AuditTrail({ projectId, onClose }) {
  const [auditEntries, setAuditEntries] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [showStats, setShowStats] = useState(false);

  // Filters
  const [filters, setFilters] = useState({
    action_type: '',
    table_name: '',
    user_id: '',
    start_date: '',
    end_date: '',
    limit: 50,
    offset: 0
  });

  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (projectId) {
      fetchProjectAudit();
    } else {
      fetchAuditTrail();
    }
  }, [projectId, filters]);

  const fetchProjectAudit = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `${API_URL}/api/audit-trail/project/${projectId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          params: { limit: filters.limit, offset: filters.offset }
        }
      );
      setAuditEntries(response.data.entries);
      setTotal(response.data.total);
      setLoading(false);
    } catch (err) {
      setError('Failed to fetch audit trail');
      setLoading(false);
    }
  };

  const fetchAuditTrail = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/audit-trail`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { ...filters, project_id: projectId || undefined }
      });
      setAuditEntries(response.data.entries);
      setTotal(response.data.total);
      setLoading(false);
    } catch (err) {
      setError('Failed to fetch audit trail');
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem('token');
      const params = {};
      if (filters.start_date) params.start_date = filters.start_date;
      if (filters.end_date) params.end_date = filters.end_date;

      const response = await axios.get(`${API_URL}/api/audit-trail/stats/summary`, {
        headers: { Authorization: `Bearer ${token}` },
        params
      });
      setStats(response.data);
      setShowStats(true);
    } catch (err) {
      setError('Failed to fetch audit statistics');
    }
  };

  const handleFilterChange = (field, value) => {
    setFilters({ ...filters, [field]: value, offset: 0 });
  };

  const handlePageChange = (direction) => {
    const newOffset = direction === 'next'
      ? filters.offset + filters.limit
      : Math.max(0, filters.offset - filters.limit);
    setFilters({ ...filters, offset: newOffset });
  };

  const resetFilters = () => {
    setFilters({
      action_type: '',
      table_name: '',
      user_id: '',
      start_date: '',
      end_date: '',
      limit: 50,
      offset: 0
    });
  };

  const getActionBadge = (actionType) => {
    const actionColors = {
      CREATE: 'badge-green',
      UPDATE: 'badge-blue',
      DELETE: 'badge-red',
      APPROVE: 'badge-purple',
      REJECT: 'badge-orange',
      VIEW: 'badge-gray',
      SUBMIT: 'badge-yellow'
    };

    const prefix = actionType.split('_')[0];
    const colorClass = actionColors[prefix] || 'badge-gray';

    return <span className={`action-badge ${colorClass}`}>{actionType}</span>;
  };

  const getStatusIcon = (status) => {
    return status === 'success' ? '✅' : '❌';
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const viewDetails = (entry) => {
    setSelectedEntry(entry);
  };

  if (loading) return <div className="loading">Loading audit trail...</div>;

  return (
    <div className="audit-trail-container">
      <div className="audit-header">
        <div>
          <h2>Audit Trail{projectId ? ' - Project' : ''}</h2>
          <p className="audit-subtitle">Complete traceability of all system actions</p>
        </div>
        <div className="audit-actions">
          <button className="btn btn-secondary" onClick={fetchStats}>
            📊 View Statistics
          </button>
          {onClose && <button className="btn btn-outline" onClick={onClose}>Close</button>}
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Statistics Modal */}
      {showStats && stats && (
        <div className="modal">
          <div className="modal-content large">
            <div className="stats-header">
              <h3>Audit Statistics</h3>
              <button className="btn-close" onClick={() => setShowStats(false)}>✕</button>
            </div>

            <div className="stats-body">
              <div className="stat-card">
                <h4>Total Actions</h4>
                <div className="stat-value">{stats.total_actions.toLocaleString()}</div>
              </div>

              <div className="stat-section">
                <h4>Action Types</h4>
                <div className="stats-grid">
                  {stats.action_types.slice(0, 10).map((item, index) => (
                    <div key={index} className="stat-item">
                      <span className="stat-label">{item.action_type}</span>
                      <span className="stat-count">{item.count}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="stat-section">
                <h4>Top Active Users</h4>
                <div className="stats-grid">
                  {stats.top_users.map((user, index) => (
                    <div key={index} className="stat-item">
                      <span className="stat-label">{user.username}</span>
                      <span className="stat-count">{user.action_count} actions</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="stat-section">
                <h4>Table Activity</h4>
                <div className="stats-grid">
                  {stats.table_activity.map((table, index) => (
                    <div key={index} className="stat-item">
                      <span className="stat-label">{table.table_name}</span>
                      <span className="stat-count">{table.action_count}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="stat-section">
                <h4>Success vs Failure</h4>
                <div className="stats-grid">
                  {stats.status_distribution.map((status, index) => (
                    <div key={index} className="stat-item">
                      <span className="stat-label">{status.action_status}</span>
                      <span className="stat-count">{status.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Entry Details Modal */}
      {selectedEntry && (
        <div className="modal">
          <div className="modal-content">
            <div className="entry-detail-header">
              <h3>Audit Entry Details</h3>
              <button className="btn-close" onClick={() => setSelectedEntry(null)}>✕</button>
            </div>

            <div className="entry-detail-body">
              <div className="detail-section">
                <h4>Action Information</h4>
                <div className="detail-grid">
                  <div><strong>Action:</strong> {getActionBadge(selectedEntry.action_type)}</div>
                  <div><strong>Status:</strong> {getStatusIcon(selectedEntry.action_status)} {selectedEntry.action_status}</div>
                  <div><strong>User:</strong> {selectedEntry.username}</div>
                  <div><strong>Timestamp:</strong> {formatTimestamp(selectedEntry.action_timestamp)}</div>
                  <div><strong>Table:</strong> {selectedEntry.table_name}</div>
                  {selectedEntry.record_id && <div><strong>Record ID:</strong> {selectedEntry.record_id}</div>}
                </div>
              </div>

              {selectedEntry.action_description && (
                <div className="detail-section">
                  <h4>Description</h4>
                  <p>{selectedEntry.action_description}</p>
                </div>
              )}

              {selectedEntry.changed_fields && selectedEntry.changed_fields.length > 0 && (
                <div className="detail-section">
                  <h4>Changed Fields</h4>
                  <div className="changed-fields">
                    {selectedEntry.changed_fields.map((field, index) => (
                      <span key={index} className="field-badge">{field}</span>
                    ))}
                  </div>
                </div>
              )}

              {selectedEntry.old_values && (
                <div className="detail-section">
                  <h4>Old Values</h4>
                  <pre className="json-view">{JSON.stringify(selectedEntry.old_values, null, 2)}</pre>
                </div>
              )}

              {selectedEntry.new_values && (
                <div className="detail-section">
                  <h4>New Values</h4>
                  <pre className="json-view">{JSON.stringify(selectedEntry.new_values, null, 2)}</pre>
                </div>
              )}

              <div className="detail-section">
                <h4>Technical Details</h4>
                <div className="detail-grid">
                  {selectedEntry.ip_address && <div><strong>IP Address:</strong> {selectedEntry.ip_address}</div>}
                  {selectedEntry.request_method && <div><strong>Method:</strong> {selectedEntry.request_method}</div>}
                  {selectedEntry.request_url && <div><strong>URL:</strong> {selectedEntry.request_url}</div>}
                  {selectedEntry.session_id && <div><strong>Session:</strong> {selectedEntry.session_id}</div>}
                </div>
              </div>

              {selectedEntry.error_message && (
                <div className="detail-section error-section">
                  <h4>Error Details</h4>
                  <p className="error-message">{selectedEntry.error_message}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      {!projectId && (
        <div className="filters-panel">
          <div className="filters-row">
            <div className="filter-group">
              <label>Action Type</label>
              <select
                value={filters.action_type}
                onChange={(e) => handleFilterChange('action_type', e.target.value)}
              >
                <option value="">All Actions</option>
                <option value="CREATE_PROJECT">Create Project</option>
                <option value="UPDATE_PROJECT">Update Project</option>
                <option value="APPROVE_PROJECT">Approve Project</option>
                <option value="CREATE_EXPENSE">Create Expense</option>
                <option value="APPROVE_EXPENSE">Approve Expense</option>
                <option value="CREATE_CHANGE_REQUEST">Create Change Request</option>
                <option value="APPROVE_CHANGE_REQUEST_LEVEL">Approve Change Request</option>
                <option value="UPLOAD_DOCUMENT">Upload Document</option>
              </select>
            </div>

            <div className="filter-group">
              <label>Table</label>
              <select
                value={filters.table_name}
                onChange={(e) => handleFilterChange('table_name', e.target.value)}
              >
                <option value="">All Tables</option>
                <option value="projects">Projects</option>
                <option value="expenses">Expenses</option>
                <option value="project_change_requests">Change Requests</option>
                <option value="project_documents">Documents</option>
                <option value="project_phases">Phases</option>
                <option value="project_milestones">Milestones</option>
              </select>
            </div>

            <div className="filter-group">
              <label>Start Date</label>
              <input
                type="date"
                value={filters.start_date}
                onChange={(e) => handleFilterChange('start_date', e.target.value)}
              />
            </div>

            <div className="filter-group">
              <label>End Date</label>
              <input
                type="date"
                value={filters.end_date}
                onChange={(e) => handleFilterChange('end_date', e.target.value)}
              />
            </div>

            <button className="btn btn-outline btn-sm" onClick={resetFilters}>
              Clear Filters
            </button>
          </div>
        </div>
      )}

      {/* Audit Entries */}
      <div className="audit-summary">
        Showing {filters.offset + 1} - {Math.min(filters.offset + filters.limit, total)} of {total} entries
      </div>

      <div className="audit-entries">
        {auditEntries.length === 0 ? (
          <p className="empty-state">No audit entries found.</p>
        ) : (
          auditEntries.map((entry) => (
            <div key={entry.id} className="audit-entry" onClick={() => viewDetails(entry)}>
              <div className="entry-header">
                <div className="entry-action">
                  {getStatusIcon(entry.action_status)}
                  {getActionBadge(entry.action_type)}
                </div>
                <div className="entry-timestamp">{formatTimestamp(entry.action_timestamp)}</div>
              </div>

              <div className="entry-description">
                {entry.action_description}
              </div>

              <div className="entry-meta">
                <span className="meta-item">
                  <strong>User:</strong> {entry.username}
                </span>
                <span className="meta-item">
                  <strong>Table:</strong> {entry.table_name}
                </span>
                {entry.record_id && (
                  <span className="meta-item">
                    <strong>Record:</strong> #{entry.record_id}
                  </span>
                )}
                {entry.changed_fields && entry.changed_fields.length > 0 && (
                  <span className="meta-item">
                    <strong>Changed:</strong> {entry.changed_fields.length} field(s)
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {total > filters.limit && (
        <div className="pagination">
          <button
            className="btn btn-outline"
            onClick={() => handlePageChange('prev')}
            disabled={filters.offset === 0}
          >
            Previous
          </button>
          <span className="pagination-info">
            Page {Math.floor(filters.offset / filters.limit) + 1} of {Math.ceil(total / filters.limit)}
          </span>
          <button
            className="btn btn-outline"
            onClick={() => handlePageChange('next')}
            disabled={filters.offset + filters.limit >= total}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

export default AuditTrail;

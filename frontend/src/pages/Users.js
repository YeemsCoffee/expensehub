import React, { useState, useEffect, useCallback } from 'react';
import { Edit2, Shield, User as UserIcon, Mail, Briefcase } from 'lucide-react';
import api from '../services/api';

const Users = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingUser, setEditingUser] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editFormData, setEditFormData] = useState({
    role: ''
  });
  const [error, setError] = useState('');

  const fetchUsers = useCallback(async () => {
    try {
      const response = await api.get('/users');
      setUsers(response.data);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching users:', err);
      setError('Failed to load users');
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleEditClick = (user) => {
    setEditingUser(user);
    setEditFormData({
      role: user.role
    });
    setShowEditModal(true);
    setError('');
  };

  const handleCancelEdit = () => {
    setEditingUser(null);
    setShowEditModal(false);
    setEditFormData({ role: '' });
    setError('');
  };

  const handleUpdateRole = async (e) => {
    e.preventDefault();
    setError('');

    try {
      await api.put(`/users/${editingUser.id}/role`, {
        role: editFormData.role
      });

      alert('User role updated successfully!');
      fetchUsers();
      handleCancelEdit();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update user role');
    }
  };

  const getRoleBadgeClass = (role) => {
    switch(role) {
      case 'admin': return 'badge-danger';
      case 'manager': return 'badge-warning';
      case 'employee': return 'badge-info';
      default: return 'badge-secondary';
    }
  };

  const getRoleIcon = (role) => {
    switch(role) {
      case 'admin': return <Shield size={16} />;
      case 'manager': return <Briefcase size={16} />;
      case 'employee': return <UserIcon size={16} />;
      default: return <UserIcon size={16} />;
    }
  };

  if (loading) {
    return <div className="page-title">Loading users...</div>;
  }

  return (
    <div>
      <h2 className="page-title">User Management</h2>
      <p className="text-gray-600 mb-6">Manage user access rights and roles</p>

      <div className="card">
        <h3 className="card-title">All Users ({users.length})</h3>
        
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Employee ID</th>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Department</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '40px' }}>
                    <p className="text-gray-500">No users found</p>
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <span className="font-mono">{user.employee_id}</span>
                    </td>
                    <td>
                      <div className="user-name-cell">
                        <UserIcon size={16} className="user-icon" />
                        <span>{user.first_name} {user.last_name}</span>
                      </div>
                    </td>
                    <td>
                      <div className="user-email-cell">
                        <Mail size={14} className="email-icon" />
                        <span>{user.email}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${getRoleBadgeClass(user.role)}`}>
                        {getRoleIcon(user.role)}
                        <span className="ml-1">{user.role}</span>
                      </span>
                    </td>
                    <td>{user.department || '-'}</td>
                    <td>{new Date(user.created_at).toLocaleDateString()}</td>
                    <td>
                      <button
                        onClick={() => handleEditClick(user)}
                        className="btn-icon"
                        title="Edit Role"
                      >
                        <Edit2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Role Modal */}
      {showEditModal && (
        <div className="modal-overlay" onClick={handleCancelEdit}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Edit User Role</h3>
              <button onClick={handleCancelEdit} className="modal-close">×</button>
            </div>

            <div className="modal-body">
              {error && (
                <div className="error-message mb-4">
                  {error}
                </div>
              )}

              <div className="user-info-display">
                <div className="user-info-row">
                  <span className="label">Name:</span>
                  <span className="value">{editingUser.first_name} {editingUser.last_name}</span>
                </div>
                <div className="user-info-row">
                  <span className="label">Email:</span>
                  <span className="value">{editingUser.email}</span>
                </div>
                <div className="user-info-row">
                  <span className="label">Employee ID:</span>
                  <span className="value">{editingUser.employee_id}</span>
                </div>
                <div className="user-info-row">
                  <span className="label">Current Role:</span>
                  <span className={`badge ${getRoleBadgeClass(editingUser.role)}`}>
                    {editingUser.role}
                  </span>
                </div>
              </div>

              <form onSubmit={handleUpdateRole}>
                <div className="form-group">
                  <label className="form-label">New Role *</label>
                  <select
                    value={editFormData.role}
                    onChange={(e) => setEditFormData({ role: e.target.value })}
                    className="form-select"
                    required
                  >
                    <option value="">Select a role</option>
                    <option value="employee">Employee</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </select>
                  <p className="form-hint">
                    <strong>Employee:</strong> Can submit and view own expenses<br/>
                    <strong>Manager:</strong> Can approve expenses and manage cost centers, locations, projects<br/>
                    <strong>Admin:</strong> Full system access including user management
                  </p>
                </div>

                <div className="modal-footer">
                  <button type="submit" className="btn btn-primary">
                    Update Role
                  </button>
                  <button type="button" onClick={handleCancelEdit} className="btn btn-secondary">
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Users;
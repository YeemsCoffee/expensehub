import React, { useState, useEffect, useCallback } from 'react';
import { Edit2, Shield, User as UserIcon, Mail, Briefcase, Plus, Trash2 } from 'lucide-react';
import api from '../services/api';
import { useToast } from '../components/Toast';

const Users = () => {
  const toast = useToast();
  const [users, setUsers] = useState([]);
  const [managers, setManagers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingUser, setEditingUser] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showEditManagerModal, setShowEditManagerModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editFormData, setEditFormData] = useState({
    role: ''
  });
  const [editManagerFormData, setEditManagerFormData] = useState({
    managerId: ''
  });
  const [createFormData, setCreateFormData] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    employeeId: '',
    department: '',
    role: 'employee',
    managerId: ''
  });
  const [error, setError] = useState('');

  const fetchUsers = useCallback(async () => {
    try {
      const response = await api.get('/users');
      setUsers(response.data);
      // Filter managers for dropdown - include manager, admin, and developer roles
      setManagers(response.data.filter(u => ['manager', 'admin', 'developer'].includes(u.role)));
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

  const handleEditManagerClick = (user) => {
    setEditingUser(user);
    setEditManagerFormData({
      managerId: user.manager_id || ''
    });
    setShowEditManagerModal(true);
    setError('');
  };

  const handleCancelEditManager = () => {
    setEditingUser(null);
    setShowEditManagerModal(false);
    setEditManagerFormData({ managerId: '' });
    setError('');
  };

  const handleCancelCreate = () => {
    setShowCreateModal(false);
    setCreateFormData({
      email: '',
      password: '',
      firstName: '',
      lastName: '',
      employeeId: '',
      department: '',
      role: 'employee'
    });
    setError('');
  };

  const handleUpdateRole = async (e) => {
    e.preventDefault();
    setError('');

    try {
      await api.put(`/users/${editingUser.id}/role`, {
        role: editFormData.role
      });

      toast.success('User role updated successfully!');
      fetchUsers();
      handleCancelEdit();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update user role');
    }
  };

  const handleUpdateManager = async (e) => {
    e.preventDefault();
    setError('');

    try {
      await api.put(`/users/${editingUser.id}/manager`, {
        managerId: editManagerFormData.managerId || null
      });

      toast.success('Manager updated successfully!');
      fetchUsers();
      handleCancelEditManager();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update manager');
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setError('');

    try {
      const userData = { ...createFormData };
      // Convert empty string to null for managerId
      if (userData.managerId === '') {
        userData.managerId = null;
      }
      await api.post('/users', userData);

      // If a manager was assigned, also update the manager relationship
      if (userData.managerId) {
        // This will be handled in the backend through a second call after user creation
        // We'll need to update this once we get the created user ID
      }

      toast.success('User created successfully!');
      fetchUsers();
      handleCancelCreate();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create user');
    }
  };

  const handleDeleteUser = async (userId, userName) => {
    if (!window.confirm(`Are you sure you want to delete user ${userName}? This action cannot be undone.`)) {
      return;
    }

    try {
      await api.delete(`/users/${userId}`);
      toast.success('User deleted successfully');
      fetchUsers();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete user');
    }
  };

  const getRoleBadgeClass = (role) => {
    switch(role) {
      case 'admin': return 'badge-danger';
      case 'manager': return 'badge-warning';
      case 'developer': return 'badge-info';
      case 'employee': return 'badge-secondary';
      default: return 'badge-secondary';
    }
  };

  const getRoleIcon = (role) => {
    switch(role) {
      case 'admin': return <Shield size={16} />;
      case 'manager': return <Briefcase size={16} />;
      case 'developer': return <Shield size={16} />;
      case 'employee': return <UserIcon size={16} />;
      default: return <UserIcon size={16} />;
    }
  };

  if (loading) {
    return <div className="page-title">Loading users...</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h2 className="page-title" style={{ marginBottom: '0.5rem' }}>User Management</h2>
          <p className="text-gray-600">Manage user access rights and roles</p>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="btn btn-primary">
          <Plus size={18} />
          Add New User
        </button>
      </div>

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
                <th>Manager</th>
                <th>Department</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '40px' }}>
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
                    <td>{user.manager_name || '-'}</td>
                    <td>{user.department || '-'}</td>
                    <td>{new Date(user.created_at).toLocaleDateString()}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => handleEditClick(user)}
                          className="btn btn-sm btn-secondary"
                          title="Edit Role"
                        >
                          <Edit2 size={14} />
                          Edit
                        </button>
                        <button
                          onClick={() => handleEditManagerClick(user)}
                          className="btn btn-sm"
                          title="Assign Manager"
                          style={{ backgroundColor: '#8b5cf6', color: 'white', border: 'none' }}
                        >
                          <Briefcase size={14} />
                          Manager
                        </button>
                        <button
                          onClick={() => handleDeleteUser(user.id, `${user.first_name} ${user.last_name}`)}
                          className="btn btn-sm btn-danger"
                          title="Delete User"
                        >
                          <Trash2 size={14} />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={handleCancelCreate}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Add New User</h3>
              <button onClick={handleCancelCreate} className="modal-close">×</button>
            </div>

            <div className="modal-body">
              {error && (
                <div className="error-message mb-4">
                  {error}
                </div>
              )}

              <form onSubmit={handleCreateUser}>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">First Name *</label>
                    <input
                      type="text"
                      value={createFormData.firstName}
                      onChange={(e) => setCreateFormData({ ...createFormData, firstName: e.target.value })}
                      className="form-input"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Last Name *</label>
                    <input
                      type="text"
                      value={createFormData.lastName}
                      onChange={(e) => setCreateFormData({ ...createFormData, lastName: e.target.value })}
                      className="form-input"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Email *</label>
                    <input
                      type="email"
                      value={createFormData.email}
                      onChange={(e) => setCreateFormData({ ...createFormData, email: e.target.value })}
                      className="form-input"
                      required
                      placeholder="user@yeemscoffee.com"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Employee ID *</label>
                    <input
                      type="text"
                      value={createFormData.employeeId}
                      onChange={(e) => setCreateFormData({ ...createFormData, employeeId: e.target.value })}
                      className="form-input"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Password *</label>
                    <input
                      type="password"
                      value={createFormData.password}
                      onChange={(e) => setCreateFormData({ ...createFormData, password: e.target.value })}
                      className="form-input"
                      required
                      minLength={6}
                      placeholder="Minimum 6 characters"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Department</label>
                    <input
                      type="text"
                      value={createFormData.department}
                      onChange={(e) => setCreateFormData({ ...createFormData, department: e.target.value })}
                      className="form-input"
                      placeholder="Optional"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Role *</label>
                  <select
                    value={createFormData.role}
                    onChange={(e) => setCreateFormData({ ...createFormData, role: e.target.value })}
                    className="form-select"
                    required
                  >
                    <option value="employee">Employee</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                    <option value="developer">Developer</option>
                  </select>
                  <p className="form-hint">
                    <strong>Employee:</strong> Can submit and view own expenses<br/>
                    <strong>Manager:</strong> Can approve expenses<br/>
                    <strong>Admin:</strong> Full system access<br/>
                    <strong>Developer:</strong> Full system access including user management
                  </p>
                </div>

                <div className="form-group">
                  <label className="form-label">Manager</label>
                  <select
                    value={createFormData.managerId}
                    onChange={(e) => setCreateFormData({ ...createFormData, managerId: e.target.value })}
                    className="form-select"
                  >
                    <option value="">No Manager</option>
                    {managers.map((manager) => (
                      <option key={manager.id} value={manager.id}>
                        {manager.first_name} {manager.last_name} ({manager.employee_id})
                      </option>
                    ))}
                  </select>
                  <p className="form-hint">
                    Assign a manager for this user. Managers can approve their team members' expenses.
                  </p>
                </div>

                <div className="modal-footer">
                  <button type="submit" className="btn btn-primary">
                    <Plus size={18} />
                    Create User
                  </button>
                  <button type="button" onClick={handleCancelCreate} className="btn btn-secondary">
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

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
                  <span className="value">
                    <span className={`badge ${getRoleBadgeClass(editingUser.role)}`}>
                      {editingUser.role}
                    </span>
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
                    <option value="developer">Developer</option>
                  </select>
                  <p className="form-hint">
                    <strong>Employee:</strong> Can submit and view own expenses<br/>
                    <strong>Manager:</strong> Can approve expenses<br/>
                    <strong>Admin:</strong> Full system access<br/>
                    <strong>Developer:</strong> Full system access including user management
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

      {/* Edit Manager Modal */}
      {showEditManagerModal && (
        <div className="modal-overlay" onClick={handleCancelEditManager}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Assign Manager</h3>
              <button onClick={handleCancelEditManager} className="modal-close">×</button>
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
                  <span className="label">Current Manager:</span>
                  <span className="value">{editingUser.manager_name || 'None'}</span>
                </div>
              </div>

              <form onSubmit={handleUpdateManager}>
                <div className="form-group">
                  <label className="form-label">New Manager</label>
                  <select
                    value={editManagerFormData.managerId}
                    onChange={(e) => setEditManagerFormData({ managerId: e.target.value })}
                    className="form-select"
                  >
                    <option value="">No Manager</option>
                    {managers.map((manager) => (
                      <option key={manager.id} value={manager.id}>
                        {manager.first_name} {manager.last_name} ({manager.employee_id})
                      </option>
                    ))}
                  </select>
                  <p className="form-hint">
                    Select a manager for this user. The manager will be able to approve this user's expense submissions.
                  </p>
                </div>

                <div className="modal-footer">
                  <button type="submit" className="btn btn-primary">
                    Update Manager
                  </button>
                  <button type="button" onClick={handleCancelEditManager} className="btn btn-secondary">
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

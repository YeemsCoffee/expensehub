import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Save, X, ArrowUp, ArrowDown, CheckCircle, XCircle, ChevronDown, ChevronRight } from 'lucide-react';
import api from '../services/api';
import { useToast } from '../components/Toast';

const ExpenseCategories = () => {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({ name: '', xero_account_code: '', xero_account_name: '' });
  const [saving, setSaving] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  // Sub-categories: which category's panel is open, its "add" input, and
  // the sub-category being renamed ({ id, name })
  const [expandedId, setExpandedId] = useState(null);
  const [newSubName, setNewSubName] = useState('');
  const [editingSub, setEditingSub] = useState(null);
  const [subBusy, setSubBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    const user = userStr ? JSON.parse(userStr) : null;
    const role = user?.role || 'employee';
    if (role === 'admin' || role === 'developer') {
      setHasPermission(true);
      fetchCategories();
    } else {
      setHasPermission(false);
      setLoading(false);
    }
  }, []);

  const fetchCategories = async () => {
    try {
      const response = await api.get('/expense-categories?all=true');
      setCategories(response.data);
    } catch (err) {
      console.error('Error fetching categories:', err);
      if (err.response?.status === 500) {
        // Table might not exist yet, try to initialize
        try {
          await api.post('/expense-categories/initialize');
          const retryResponse = await api.get('/expense-categories?all=true');
          setCategories(retryResponse.data);
          toast.success('Categories initialized successfully');
        } catch (initErr) {
          console.error('Error initializing categories:', initErr);
          toast.error('Failed to load categories');
        }
      } else {
        toast.error('Failed to load categories');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error('Category name is required');
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        await api.put(`/expense-categories/${editingId}`, formData);
        toast.success('Category updated successfully');
      } else {
        await api.post('/expense-categories', formData);
        toast.success('Category created successfully');
      }
      setShowForm(false);
      setEditingId(null);
      setFormData({ name: '', xero_account_code: '', xero_account_name: '' });
      fetchCategories();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save category');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (category) => {
    setEditingId(category.id);
    setFormData({
      name: category.name,
      xero_account_code: category.xero_account_code || '',
      xero_account_name: category.xero_account_name || ''
    });
    setShowForm(true);
  };

  const handleToggleActive = async (category) => {
    try {
      await api.put(`/expense-categories/${category.id}`, { is_active: !category.is_active });
      toast.success(`Category ${category.is_active ? 'deactivated' : 'activated'}`);
      fetchCategories();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update category');
    }
  };

  const handleDelete = async (category) => {
    if (!window.confirm(`Are you sure you want to delete "${category.name}"? This cannot be undone.`)) {
      return;
    }
    try {
      await api.delete(`/expense-categories/${category.id}`);
      toast.success('Category deleted');
      fetchCategories();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete category');
    }
  };

  const handleReorder = async (category, direction) => {
    const currentIndex = categories.findIndex(c => c.id === category.id);
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= categories.length) return;

    const targetCategory = categories[targetIndex];
    try {
      await Promise.all([
        api.put(`/expense-categories/${category.id}`, { display_order: targetCategory.display_order }),
        api.put(`/expense-categories/${targetCategory.id}`, { display_order: category.display_order })
      ]);
      fetchCategories();
    } catch (err) {
      toast.error('Failed to reorder categories');
    }
  };

  // ---------------------------------------------------------------------------
  // Sub-categories
  // ---------------------------------------------------------------------------
  const toggleExpanded = (categoryId) => {
    setExpandedId(prev => (prev === categoryId ? null : categoryId));
    setNewSubName('');
    setEditingSub(null);
  };

  const runSubAction = async (action, successMessage) => {
    setSubBusy(true);
    try {
      await action();
      if (successMessage) toast.success(successMessage);
      await fetchCategories();
      return true;
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update sub-category');
      return false;
    } finally {
      setSubBusy(false);
    }
  };

  const handleAddSub = async (e, category) => {
    e.preventDefault();
    const name = newSubName.trim();
    if (!name) return;
    const ok = await runSubAction(
      () => api.post(`/expense-categories/${category.id}/subcategories`, { name }),
      `Added "${name}" to ${category.name}`
    );
    if (ok) setNewSubName('');
  };

  const handleRenameSub = async (e) => {
    e.preventDefault();
    const name = editingSub.name.trim();
    if (!name) return;
    const ok = await runSubAction(
      () => api.put(`/expense-categories/subcategories/${editingSub.id}`, { name }),
      'Sub-category renamed'
    );
    if (ok) setEditingSub(null);
  };

  const handleToggleSub = (sub) => runSubAction(
    () => api.put(`/expense-categories/subcategories/${sub.id}`, { is_active: !sub.is_active }),
    `"${sub.name}" ${sub.is_active ? 'deactivated' : 'activated'}`
  );

  const handleDeleteSub = (sub) => {
    if (!window.confirm(`Delete the sub-category "${sub.name}"? This cannot be undone.`)) return;
    runSubAction(
      () => api.delete(`/expense-categories/subcategories/${sub.id}`),
      `"${sub.name}" deleted`
    );
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData({ name: '', xero_account_code: '', xero_account_name: '' });
  };

  if (!hasPermission) {
    return (
      <div className="container">
        <div className="empty-state">
          <h3>Access Denied</h3>
          <p>Only admin or developer users can manage expense categories.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container">
        <div className="loading-spinner"></div>
        Loading categories...
      </div>
    );
  }

  const activeCount = categories.filter(c => c.is_active).length;
  const inactiveCount = categories.filter(c => !c.is_active).length;

  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h2 className="page-title" style={{ margin: 0 }}>Expense Categories</h2>
          <p style={{ color: '#6b7280', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Manage expense categories. {activeCount} active, {inactiveCount} inactive.
          </p>
          <p style={{ color: '#6b7280', fontSize: '0.8125rem', marginTop: '0.25rem' }}>
            The Xero account each category posts to is chosen in <strong>Settings → Xero Integration</strong>,
            from your live Xero chart of accounts. A code set here is only a fallback for categories not mapped there.
          </p>
        </div>
        <button
          onClick={() => { setShowForm(true); setEditingId(null); setFormData({ name: '', xero_account_code: '', xero_account_name: '' }); }}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            padding: '0.5rem 1rem', border: 'none', borderRadius: '0.5rem',
            background: '#2B4628', color: 'white', cursor: 'pointer',
            fontSize: '0.875rem', fontWeight: '500'
          }}
        >
          <Plus size={16} />
          Add Category
        </button>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="card" style={{ marginBottom: '1.5rem', border: '2px solid #2B4628' }}>
          <h3 style={{ marginBottom: '1rem' }}>{editingId ? 'Edit Category' : 'Add New Category'}</h3>
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                  Category Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Travel"
                  required
                  style={{
                    width: '100%', padding: '0.5rem', border: '1px solid #d1d5db',
                    borderRadius: '0.375rem', fontSize: '0.875rem'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                  Fallback Xero Account Code (optional)
                </label>
                <input
                  type="text"
                  value={formData.xero_account_code}
                  onChange={(e) => setFormData({ ...formData, xero_account_code: e.target.value })}
                  placeholder="e.g. 400"
                  style={{
                    width: '100%', padding: '0.5rem', border: '1px solid #d1d5db',
                    borderRadius: '0.375rem', fontSize: '0.875rem'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                  Xero Account Name
                </label>
                <input
                  type="text"
                  value={formData.xero_account_name}
                  onChange={(e) => setFormData({ ...formData, xero_account_name: e.target.value })}
                  placeholder="e.g. General Expenses"
                  style={{
                    width: '100%', padding: '0.5rem', border: '1px solid #d1d5db',
                    borderRadius: '0.375rem', fontSize: '0.875rem'
                  }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button type="button" onClick={cancelForm}
                style={{
                  padding: '0.5rem 1rem', border: '1px solid #d1d5db', borderRadius: '0.375rem',
                  background: 'white', color: '#6b7280', cursor: 'pointer', fontSize: '0.875rem'
                }}
              >
                <X size={14} style={{ marginRight: '0.25rem', verticalAlign: 'middle' }} />
                Cancel
              </button>
              <button type="submit" disabled={saving}
                style={{
                  padding: '0.5rem 1rem', border: 'none', borderRadius: '0.375rem',
                  background: saving ? '#d1d5db' : '#2B4628', color: 'white',
                  cursor: saving ? 'not-allowed' : 'pointer', fontSize: '0.875rem',
                  display: 'flex', alignItems: 'center', gap: '0.25rem'
                }}
              >
                <Save size={14} />
                {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Categories Table */}
      <div className="card">
        {categories.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
            <p>No categories found. Click "Add Category" to create your first one.</p>
          </div>
        ) : (
          <table className="data-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={{ width: '40px' }}>Order</th>
                <th>Category Name</th>
                <th>Sub-categories</th>
                <th>Fallback Xero Code</th>
                <th>Xero Account Name</th>
                <th>Status</th>
                <th style={{ width: '180px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((category, index) => {
                const subs = category.subcategories || [];
                const activeSubs = subs.filter(sc => sc.is_active).length;
                const expanded = expandedId === category.id;
                return (
                <React.Fragment key={category.id}>
                <tr style={{ opacity: category.is_active ? 1 : 0.5 }}>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <button onClick={() => handleReorder(category, 'up')} disabled={index === 0}
                        style={{ border: 'none', background: 'transparent', cursor: index === 0 ? 'default' : 'pointer', padding: '2px', opacity: index === 0 ? 0.3 : 1 }}>
                        <ArrowUp size={14} />
                      </button>
                      <button onClick={() => handleReorder(category, 'down')} disabled={index === categories.length - 1}
                        style={{ border: 'none', background: 'transparent', cursor: index === categories.length - 1 ? 'default' : 'pointer', padding: '2px', opacity: index === categories.length - 1 ? 0.3 : 1 }}>
                        <ArrowDown size={14} />
                      </button>
                    </div>
                  </td>
                  <td style={{ fontWeight: '500' }}>{category.name}</td>
                  <td>
                    <button
                      onClick={() => toggleExpanded(category.id)}
                      aria-expanded={expanded}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                        padding: '0.25rem 0.5rem', border: '1px solid #d1d5db',
                        borderRadius: '0.25rem', background: 'white', color: '#374151',
                        cursor: 'pointer', fontSize: '0.75rem'
                      }}
                    >
                      {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      {subs.length === 0
                        ? 'Add'
                        : `${activeSubs} active${subs.length > activeSubs ? `, ${subs.length - activeSubs} inactive` : ''}`}
                    </button>
                  </td>
                  <td>
                    {category.xero_account_code ? (
                      <span style={{ padding: '0.25rem 0.5rem', borderRadius: '0.25rem', background: '#f0fdf4', color: '#10b981', fontSize: '0.875rem', fontWeight: '500' }}>
                        {category.xero_account_code}
                      </span>
                    ) : (
                      <span style={{ color: '#9ca3af', fontSize: '0.875rem' }} title="No fallback set - map this category in Settings → Xero Integration">
                        -
                      </span>
                    )}
                  </td>
                  <td style={{ color: '#6b7280', fontSize: '0.875rem' }}>
                    {category.xero_account_name || '-'}
                  </td>
                  <td>
                    <button onClick={() => handleToggleActive(category)}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                        padding: '0.25rem 0.5rem', border: 'none', borderRadius: '0.25rem',
                        background: category.is_active ? '#f0fdf4' : '#fee2e2',
                        color: category.is_active ? '#10b981' : '#ef4444',
                        cursor: 'pointer', fontSize: '0.75rem', fontWeight: '600'
                      }}
                    >
                      {category.is_active ? <CheckCircle size={12} /> : <XCircle size={12} />}
                      {category.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button onClick={() => handleEdit(category)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '0.25rem',
                          padding: '0.25rem 0.5rem', border: '1px solid #d1d5db',
                          borderRadius: '0.25rem', background: 'white', color: '#374151',
                          cursor: 'pointer', fontSize: '0.75rem'
                        }}
                      >
                        <Edit2 size={12} /> Edit
                      </button>
                      <button onClick={() => handleDelete(category)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '0.25rem',
                          padding: '0.25rem 0.5rem', border: '1px solid #ef4444',
                          borderRadius: '0.25rem', background: 'white', color: '#ef4444',
                          cursor: 'pointer', fontSize: '0.75rem'
                        }}
                      >
                        <Trash2 size={12} /> Delete
                      </button>
                    </div>
                  </td>
                </tr>

                {expanded && (
                  <tr>
                    <td></td>
                    <td colSpan="6" style={{ background: '#f9fafb', padding: '0.75rem 1rem' }}>
                      <p style={{ margin: '0 0 0.5rem', fontSize: '0.8125rem', color: '#6b7280' }}>
                        Sub-categories of <strong>{category.name}</strong>. When a category has active sub-categories,
                        employees must pick one when they submit an expense. Each can be mapped to its own Xero account
                        in Settings → Xero Integration; otherwise it posts to {category.name}'s account.
                      </p>

                      {subs.length > 0 && (
                        <ul style={{ listStyle: 'none', margin: '0 0 0.75rem', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                          {subs.map(sub => (
                            <li key={sub.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', opacity: sub.is_active ? 1 : 0.6 }}>
                              {editingSub && editingSub.id === sub.id ? (
                                <form onSubmit={handleRenameSub} style={{ display: 'flex', gap: '0.375rem', alignItems: 'center' }}>
                                  <input
                                    type="text"
                                    value={editingSub.name}
                                    onChange={(e) => setEditingSub({ ...editingSub, name: e.target.value })}
                                    aria-label={`New name for ${sub.name}`}
                                    maxLength={100}
                                    autoFocus
                                    style={{ padding: '0.25rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.875rem' }}
                                  />
                                  <button type="submit" disabled={subBusy || !editingSub.name.trim()}
                                    style={{ padding: '0.25rem 0.5rem', border: 'none', borderRadius: '0.25rem', background: '#2B4628', color: 'white', cursor: 'pointer', fontSize: '0.75rem' }}>
                                    Save
                                  </button>
                                  <button type="button" onClick={() => setEditingSub(null)}
                                    style={{ padding: '0.25rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '0.25rem', background: 'white', color: '#6b7280', cursor: 'pointer', fontSize: '0.75rem' }}>
                                    Cancel
                                  </button>
                                </form>
                              ) : (
                                <span style={{ fontSize: '0.875rem', minWidth: '10rem' }}>{sub.name}</span>
                              )}
                              <button onClick={() => handleToggleSub(sub)} disabled={subBusy}
                                style={{
                                  display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                                  padding: '0.125rem 0.5rem', border: 'none', borderRadius: '0.25rem',
                                  background: sub.is_active ? '#f0fdf4' : '#fee2e2',
                                  color: sub.is_active ? '#10b981' : '#ef4444',
                                  cursor: 'pointer', fontSize: '0.75rem', fontWeight: '600'
                                }}
                              >
                                {sub.is_active ? <CheckCircle size={12} /> : <XCircle size={12} />}
                                {sub.is_active ? 'Active' : 'Inactive'}
                              </button>
                              {!(editingSub && editingSub.id === sub.id) && (
                                <button onClick={() => setEditingSub({ id: sub.id, name: sub.name })} disabled={subBusy}
                                  aria-label={`Rename ${sub.name}`}
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.125rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '0.25rem', background: 'white', color: '#374151', cursor: 'pointer', fontSize: '0.75rem' }}>
                                  <Edit2 size={12} /> Rename
                                </button>
                              )}
                              <button onClick={() => handleDeleteSub(sub)} disabled={subBusy}
                                aria-label={`Delete ${sub.name}`}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.125rem 0.5rem', border: '1px solid #ef4444', borderRadius: '0.25rem', background: 'white', color: '#ef4444', cursor: 'pointer', fontSize: '0.75rem' }}>
                                <Trash2 size={12} /> Delete
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}

                      <form onSubmit={(e) => handleAddSub(e, category)} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <input
                          type="text"
                          value={newSubName}
                          onChange={(e) => setNewSubName(e.target.value)}
                          placeholder={`New sub-category of ${category.name}`}
                          aria-label={`New sub-category of ${category.name}`}
                          maxLength={100}
                          style={{ flex: '1 1 220px', maxWidth: '320px', padding: '0.375rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.875rem' }}
                        />
                        <button type="submit" disabled={subBusy || !newSubName.trim()}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                            padding: '0.375rem 0.75rem', border: 'none', borderRadius: '0.375rem',
                            background: subBusy || !newSubName.trim() ? '#d1d5db' : '#2B4628', color: 'white',
                            cursor: subBusy || !newSubName.trim() ? 'not-allowed' : 'pointer', fontSize: '0.8125rem'
                          }}
                        >
                          <Plus size={14} /> Add sub-category
                        </button>
                      </form>
                    </td>
                  </tr>
                )}
                </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default ExpenseCategories;

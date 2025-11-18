import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, MapPin, Building, TrendingUp } from 'lucide-react';
import api from '../services/api';

const Locations = () => {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    country: 'USA'
  });
  const [error, setError] = useState('');
  const [locationStats, setLocationStats] = useState({});

  useEffect(() => {
    fetchLocations();
  }, []);

  const fetchLocations = async () => {
    try {
      const response = await api.get('/locations');
      setLocations(response.data);
      setLoading(false);
      
      // Fetch stats for each location
      response.data.forEach(async (location) => {
        const statsResponse = await api.get(`/locations/${location.id}/stats`);
        setLocationStats(prev => ({
          ...prev,
          [location.id]: statsResponse.data
        }));
      });
    } catch (err) {
      console.error('Error fetching locations:', err);
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
      address: '',
      city: '',
      state: '',
      zipCode: '',
      country: 'USA'
    });
    setEditingId(null);
    setShowForm(false);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!formData.code || !formData.name) {
      setError('Please fill in code and name (required fields)');
      return;
    }

    try {
      if (editingId) {
        await api.put(`/locations/${editingId}`, formData);
        alert('Location updated successfully!');
      } else {
        await api.post('/locations', formData);
        alert('Location created successfully!');
      }
      
      fetchLocations();
      resetForm();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save location');
    }
  };

  const handleEdit = (location) => {
    setFormData({
      code: location.code,
      name: location.name,
      address: location.address || '',
      city: location.city || '',
      state: location.state || '',
      zipCode: location.zip_code || '',
      country: location.country || 'USA'
    });
    setEditingId(location.id);
    setShowForm(true);
  };

  const handleDelete = async (id, code) => {
    if (window.confirm(`Are you sure you want to delete location ${code}?`)) {
      try {
        await api.delete(`/locations/${id}`);
        alert('Location deleted successfully!');
        fetchLocations();
      } catch (err) {
        alert(err.response?.data?.error || 'Failed to delete location');
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
    return <div className="page-title">Loading locations...</div>;
  }

  return (
    <div className="container">
      <div className="page-header">
        <h2 className="page-title">Locations</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="btn btn-primary"
        >
          <Plus size={20} />
          {showForm ? 'Cancel' : 'Add Location'}
        </button>
      </div>

      {showForm && (
        <div className="card mb-6">
          <h3 className="card-title">
            {editingId ? 'Edit Location' : 'Create New Location'}
          </h3>
          
          {error && (
            <div className="error-message mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Location Code *</label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => handleInputChange('code', e.target.value)}
                  placeholder="LOC-001"
                  className="form-input"
                  required
                  disabled={editingId}
                />
                <p className="form-hint">Unique identifier (e.g., LOC-001, STORE-NYC)</p>
              </div>

              <div className="form-group">
                <label className="form-label">Location Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  placeholder="New York Office"
                  className="form-input"
                  required
                />
              </div>

              <div className="form-group form-grid-full">
                <label className="form-label">Address</label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => handleInputChange('address', e.target.value)}
                  placeholder="123 Main Street"
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label">City</label>
                <input
                  type="text"
                  value={formData.city}
                  onChange={(e) => handleInputChange('city', e.target.value)}
                  placeholder="New York"
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label">State/Province</label>
                <input
                  type="text"
                  value={formData.state}
                  onChange={(e) => handleInputChange('state', e.target.value)}
                  placeholder="CA"
                  className="form-input"
                  maxLength="2"
                />
                <p className="form-hint">2-letter state code (e.g., CA, NY)</p>
              </div>

              <div className="form-group">
                <label className="form-label">ZIP Code</label>
                <input
                  type="text"
                  value={formData.zipCode}
                  onChange={(e) => handleInputChange('zipCode', e.target.value)}
                  placeholder="90014"
                  className="form-input"
                  maxLength="10"
                />
                <p className="form-hint">Required for Amazon orders</p>
              </div>

              <div className="form-group">
                <label className="form-label">Country</label>
                <input
                  type="text"
                  value={formData.country}
                  onChange={(e) => handleInputChange('country', e.target.value)}
                  placeholder="USA"
                  className="form-input"
                />
              </div>
            </div>

            <div className="form-actions">
              <button type="submit" className="btn btn-primary">
                {editingId ? 'Update Location' : 'Create Location'}
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
          All Locations ({locations.length})
        </h3>

        {locations.length === 0 ? (
          <div className="empty-state">
            <MapPin size={48} className="empty-state-icon" />
            <p className="empty-state-text">No locations yet</p>
            <p className="empty-state-subtext">
              Create your first location to start tracking expenses by location
            </p>
            <button 
              onClick={() => setShowForm(true)}
              className="btn btn-primary mt-4"
            >
              <Plus size={20} />
              Add Location
            </button>
          </div>
        ) : (
          <div className="cost-center-grid">
            {locations.map((location) => (
              <div key={location.id} className="cost-center-card">
                <div className="cost-center-header">
                  <div>
                    <h4 className="cost-center-code">{location.code}</h4>
                    <p className="cost-center-name">{location.name}</p>
                  </div>
                  <div className="cost-center-actions">
                    <button
                      onClick={() => handleEdit(location)}
                      className="btn-icon"
                      title="Edit"
                    >
                      <Edit2 size={18} />
                    </button>
                    <button
                      onClick={() => handleDelete(location.id, location.code)}
                      className="btn-icon btn-icon-danger"
                      title="Delete"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>

                <div className="cost-center-details">
                  {location.city && location.state && (
                    <div className="cost-center-detail">
                      <MapPin size={16} className="detail-icon" />
                      <span>{location.city}, {location.state}</span>
                    </div>
                  )}
                  {location.address && (
                    <div className="cost-center-detail">
                      <Building size={16} className="detail-icon" />
                      <span>{location.address}</span>
                    </div>
                  )}
                  {locationStats[location.id] && (
                    <div className="cost-center-detail">
                      <TrendingUp size={16} className="detail-icon" />
                      <span>
                        {locationStats[location.id].expense_count} expenses • 
                        {formatCurrency(locationStats[location.id].total_amount)}
                      </span>
                    </div>
                  )}
                </div>

                <span className="badge badge-success">Active</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Locations;
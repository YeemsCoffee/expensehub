import React, { useState, useEffect } from 'react';
import api from '../services/api';

const PunchoutVendors = () => {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchVendors();
  }, []);

  const fetchVendors = async () => {
    try {
      const response = await api.get('/punchout/vendors');
      setVendors(response.data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching punchout vendors:', error);
      setLoading(false);
    }
  };

  const handlePunchout = async (vendorId) => {
    try {
      // Initiate punchout session without cost center
      const response = await api.post(`/punchout/initiate/${vendorId}`, {});

      if (response.data.type === 'redirect') {
        // OCI redirect
        window.location.href = response.data.url;
      } else {
        // cXML form submission (response contains HTML form)
        const newWindow = window.open('', '_blank');
        newWindow.document.write(response.data);
        newWindow.document.close();
      }
    } catch (error) {
      console.error('Error initiating punchout:', error);
      alert('Failed to connect to vendor. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <p>Loading vendor catalogs...</p>
      </div>
    );
  }

  return (
    <div className="punchout-vendors">
      <div className="punchout-header">
        <h2>External Vendor Catalogs</h2>
        <p>Shop directly from our approved vendors and your selections will be added to your cart</p>
      </div>

      <div className="vendor-grid">
        {vendors.map((vendor) => (
          <div key={vendor.id} className="punchout-vendor-card">
            <div className="vendor-logo">
              {vendor.logo ? (
                <img src={vendor.logo} alt={vendor.name} />
              ) : (
                <div className="vendor-placeholder">{vendor.name[0]}</div>
              )}
            </div>
            <div className="vendor-info">
              <h3>{vendor.name}</h3>
              <div className="vendor-categories">
                {vendor.categories.map((cat, idx) => (
                  <span key={idx} className="category-badge">{cat}</span>
                ))}
              </div>
              <p className="vendor-type">
                Integration: {vendor.type.toUpperCase()}
              </p>
            </div>
            <button 
              className="btn btn-primary btn-full"
              onClick={() => handlePunchout(vendor.id)}
            >
              Shop at {vendor.name}
            </button>
          </div>
        ))}
      </div>

      <div className="punchout-info">
        <h4>How it works:</h4>
        <ol>
          <li>Click "Shop at [Vendor]" to open their catalog</li>
          <li>Browse and add items to your cart on the vendor's site</li>
          <li>Click "Return to ExpenseHub" when done</li>
          <li>Your selected items will appear in your ExpenseHub cart</li>
          <li>Submit for approval as usual</li>
        </ol>
      </div>
    </div>
  );
};

export default PunchoutVendors;
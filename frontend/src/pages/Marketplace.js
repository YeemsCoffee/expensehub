import React, { useState, useEffect } from 'react';
import { Plus, ExternalLink } from 'lucide-react';
import { VENDORS } from '../utils/constants';
import api from '../services/api';
import '../styles/marketplace.css';

const Marketplace = ({ onAddToCart, onRefreshCart }) => {
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [loading, setLoading] = useState(false);
  const [punchoutSuccess, setPunchoutSuccess] = useState(false);

  useEffect(() => {
    // Check if we're returning from a punchout session
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('punchout_success') === 'true') {
      setPunchoutSuccess(true);
      // Clear the URL parameter
      window.history.replaceState({}, '', window.location.pathname);

      // Refresh cart to show newly added items
      if (onRefreshCart) {
        onRefreshCart();
      }

      // Show success message for 5 seconds
      setTimeout(() => setPunchoutSuccess(false), 5000);
    }
  }, [onRefreshCart]);

  const handleAmazonPunchout = async () => {
    try {
      setLoading(true);

      // Get the user's default cost center or let them select one
      const costCenterId = 1; // You might want to let the user select this

      // Request punchout session setup (server-side POST to Amazon)
      const response = await api.post('/amazon-punchout/setup', { costCenterId });

      const { startUrl } = response.data;

      // Redirect to Amazon's StartPage URL
      window.location.href = startUrl;

    } catch (error) {
      console.error('Failed to initiate Amazon punchout:', error);

      let errorMessage = 'Failed to connect to Amazon Business.';

      if (error.response?.status === 400) {
        errorMessage += '\n\nThis may be due to:\n' +
          '• Amazon credentials not yet activated\n' +
          '• Return URL not whitelisted by Amazon\n' +
          '• Test mode not enabled for your account\n\n' +
          'Please contact Amazon Business support to verify your integration is set up.';
      } else if (error.response?.status === 502) {
        errorMessage += '\n\nReceived response from Amazon but no StartPage URL found.\n' +
          'Check your credentials and domain settings.';
      } else if (error.response?.data?.details) {
        errorMessage += '\n\nDetails: ' + error.response.data.details;
      }

      alert(errorMessage);
      setLoading(false);
    }
  };

  return (
    <div className="marketplace-container">
      <div className="marketplace-header">
        <div className="marketplace-header-content">
          <h1 className="marketplace-title">Vendor Marketplace</h1>
          <p className="marketplace-subtitle">Shop from our trusted vendor partners</p>
        </div>
        {/* Removed search for cleaner look - can be added back if needed */}
      </div>

      {punchoutSuccess && (
        <div className="marketplace-success-banner">
          <div className="success-banner-icon">✓</div>
          <div className="success-banner-content">
            <strong>Items added successfully!</strong>
            <p>Your Amazon Business items have been added to your cart</p>
          </div>
        </div>
      )}

      {!selectedVendor ? (
        <div>
          <div className="vendor-grid">
            {/* Amazon Business Card */}
            <div className="amazon-featured-card">
              <div className="amazon-card-content">
                <div className="amazon-card-header">
                  <div className="amazon-logo-section">
                    <h3 className="amazon-title">Amazon Business</h3>
                    <span className="amazon-badge">Integration</span>
                  </div>
                  <div className="amazon-rating">
                    <div className="rating-stars">★★★★★</div>
                    <span className="rating-text">4.8</span>
                  </div>
                </div>

                <p className="amazon-description">
                  Access millions of products with competitive pricing and fast delivery.
                </p>

                <div className="amazon-features">
                  <div className="feature-item">
                    <span className="feature-icon">📦</span>
                    <span>Millions of Products</span>
                  </div>
                  <div className="feature-item">
                    <span className="feature-icon">⚡</span>
                    <span>Fast Delivery</span>
                  </div>
                </div>

                <button
                  onClick={handleAmazonPunchout}
                  disabled={loading}
                  className="amazon-shop-button"
                >
                  {loading ? (
                    <span className="button-loading">
                      <span className="loading-spinner"></span>
                      Connecting...
                    </span>
                  ) : (
                    <>
                      <ExternalLink size={18} />
                      <span>Shop on Amazon</span>
                      <span className="button-arrow">→</span>
                    </>
                  )}
                </button>

                <p className="amazon-note">
                  Items will be added to your cart
                </p>
              </div>
            </div>

            {/* Regular Vendors */}
            {VENDORS.map((vendor) => (
              <div
                key={vendor.id}
                onClick={() => setSelectedVendor(vendor)}
                className="vendor-card-modern"
              >
                <div className="vendor-card-header">
                  <div>
                    <h3 className="vendor-name">{vendor.name}</h3>
                    <p className="vendor-category">{vendor.category}</p>
                  </div>
                  <div className="vendor-rating">
                    <span className="vendor-rating-star">★</span>
                    <span className="vendor-rating-value">{vendor.rating}</span>
                  </div>
                </div>
                <p className="vendor-product-count">{vendor.products.length} products available</p>
                <button className="vendor-browse-button">
                  Browse Products
                  <span className="button-arrow">→</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div>
          <button
            onClick={() => setSelectedVendor(null)}
            className="btn btn-link mb-4"
          >
            ← Back to Vendors
          </button>
          <div className="card">
            <div className="vendor-card-header mb-6">
              <div>
                <h3 className="vendor-name">{selectedVendor.name}</h3>
                <p className="vendor-category">{selectedVendor.category}</p>
              </div>
              <div className="vendor-rating">
                <span className="vendor-rating-star">★</span>
                <span className="vendor-rating-value">{selectedVendor.rating}</span>
              </div>
            </div>
            <div className="product-grid">
              {selectedVendor.products.map((product) => (
                <div key={product.id} className="product-card">
                  <h4 className="product-name">{product.name}</h4>
                  <p className="product-description">{product.description}</p>
                  <div className="product-footer">
                    <span className="product-price">${product.price}</span>
                    <button
                      onClick={() => onAddToCart(selectedVendor, product)}
                      className="btn btn-primary"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add to Cart</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Marketplace;

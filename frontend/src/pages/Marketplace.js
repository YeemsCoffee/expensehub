import React, { useState, useEffect } from 'react';
import { Search, Plus, ExternalLink } from 'lucide-react';
import { VENDORS } from '../utils/constants';
import api from '../services/api';

const Marketplace = ({ onAddToCart }) => {
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

      // Show success message for 5 seconds
      setTimeout(() => setPunchoutSuccess(false), 5000);
    }
  }, []);

  const handleAmazonPunchout = async () => {
    try {
      setLoading(true);

      // Get the user's default cost center or let them select one
      const costCenterId = 1; // You might want to let the user select this

      // Request punchout session setup (server-side POST to Amazon)
      const response = await api.post('/amazon-punchout/setup', { costCenterId });

      const { startUrl, success } = response.data;

      if (success && startUrl) {
        // Backend already handled the Amazon POST, just redirect to the StartPage URL
        window.location.href = startUrl;
      } else {
        throw new Error('No startUrl received from backend');
      }

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
    <div>
      <div className="page-header">
        <h2 className="page-title">Vendor Marketplace</h2>
        <div className="search-bar">
          <Search className="search-icon" />
          <input
            type="text"
            placeholder="Search products..."
            className="form-input"
          />
        </div>
      </div>

      {punchoutSuccess && (
        <div className="alert alert-success mb-4">
          <strong>Success!</strong> Items from Amazon Business have been added to your cart.
        </div>
      )}

      {!selectedVendor ? (
        <div>
          <div className="vendor-grid">
              {/* Amazon Business Punchout Card */}
              <div className="vendor-card vendor-card-featured">
                <div className="vendor-card-header">
                  <div>
                    <h3 className="vendor-name">
                      Amazon Business
                      <span className="badge badge-primary ml-2">Integration</span>
                    </h3>
                    <p className="vendor-category">General Supplies & More</p>
                  </div>
                  <div className="vendor-rating">
                    <span className="vendor-rating-star">★</span>
                    <span className="vendor-rating-value">4.8</span>
                  </div>
                </div>
                <p className="vendor-product-count">Millions of products available</p>
                <button
                  onClick={handleAmazonPunchout}
                  disabled={loading}
                  className="btn btn-primary btn-full"
                >
                  {loading ? (
                    <span>Connecting...</span>
                  ) : (
                    <>
                      <ExternalLink className="w-4 h-4" />
                      <span>Shop on Amazon Business</span>
                    </>
                  )}
                </button>
                <p className="text-xs text-gray-500 mt-2">
                  You'll be redirected to Amazon Business. Items added will return to your cart.
                </p>
              </div>

              {/* Regular Vendors */}
              {VENDORS.map((vendor) => (
                <div
                  key={vendor.id}
                  onClick={() => setSelectedVendor(vendor)}
                  className="vendor-card"
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
                  <button className="btn btn-primary btn-full">
                    Browse Products
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

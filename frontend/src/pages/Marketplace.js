import React, { useState, useEffect } from 'react';
import { Search, Plus, ExternalLink } from 'lucide-react';
import { VENDORS } from '../utils/constants';
import api from '../services/api';
import { useToast } from '../components/Toast';

const Marketplace = ({ onAddToCart }) => {
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [punchoutVendors, setPunchoutVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    fetchPunchoutVendors();
  }, []);

  const fetchPunchoutVendors = async () => {
    try {
      const response = await api.get('/punchout/vendors');
      setPunchoutVendors(response.data);
    } catch (error) {
      console.error('Error fetching punchout vendors:', error);
      // Continue even if punchout vendors fail to load
    } finally {
      setLoading(false);
    }
  };

  const handlePunchout = async (vendorId) => {
    try {
      toast.info('Connecting to vendor catalog...');

      const response = await api.post(`/punchout/initiate/${vendorId}`, {
        costCenterId: null // Optional: can be set if you have a selected cost center
      });

      if (response.data.type === 'redirect') {
        // OCI-style redirect
        window.location.href = response.data.url;
      } else {
        // cXML-style form submission (response is HTML)
        const newWindow = window.open('', '_blank');
        newWindow.document.write(response.data);
        newWindow.document.close();
      }
    } catch (error) {
      console.error('Punchout error:', error);
      toast.error('Failed to connect to vendor. Please try again.');
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

      {!selectedVendor ? (
        <>
          {/* Punchout Vendors Section */}
          {punchoutVendors.length > 0 && (
            <div className="mb-8">
              <h3 className="text-xl font-semibold mb-4">🔗 Punchout Catalogs</h3>
              <p className="text-gray-600 mb-4">
                Browse millions of products from integrated vendors. Items are automatically added to your cart.
              </p>
              <div className="vendor-grid">
                {punchoutVendors.map((vendor) => (
                  <div
                    key={vendor.id}
                    className="vendor-card"
                    style={{
                      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                      color: 'white',
                      border: 'none'
                    }}
                  >
                    <div className="vendor-card-header">
                      <div>
                        <h3 className="vendor-name" style={{ color: 'white' }}>{vendor.name}</h3>
                        <p className="vendor-category" style={{ color: 'rgba(255,255,255,0.9)' }}>
                          {vendor.categories?.join(', ')}
                        </p>
                      </div>
                      <ExternalLink size={24} />
                    </div>
                    <p className="vendor-product-count" style={{ color: 'rgba(255,255,255,0.8)' }}>
                      External catalog with millions of items
                    </p>
                    <button
                      onClick={() => handlePunchout(vendor.id)}
                      className="btn btn-full"
                      style={{
                        background: 'white',
                        color: '#667eea',
                        border: 'none',
                        fontWeight: '600'
                      }}
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>Browse {vendor.name}</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Regular Vendors Section */}
          <div>
            <h3 className="text-xl font-semibold mb-4">📦 Internal Catalog</h3>
            <div className="vendor-grid">
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
        </>
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

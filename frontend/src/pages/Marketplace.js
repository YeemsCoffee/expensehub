import React, { useState } from 'react';
import { Search, Plus } from 'lucide-react';
import { VENDORS } from '../utils/constants';

const Marketplace = ({ onAddToCart }) => {
  const [selectedVendor, setSelectedVendor] = useState(null);

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

import React from 'react';
import { ShoppingCart, Plus, Minus, X } from 'lucide-react';
import { COST_CENTERS } from '../utils/constants';
import { calculateCartTotal, calculateTax, formatCurrency } from '../utils/helpers';

const Cart = ({ cart, onUpdateQuantity, onRemoveItem, onCheckout, onNavigate }) => {
  const subtotal = calculateCartTotal(cart);
  const tax = calculateTax(subtotal);
  const total = subtotal + tax;

  if (cart.length === 0) {
    return (
      <div>
        <h2 className="page-title">Shopping Cart</h2>
        <div className="cart-empty">
          <ShoppingCart className="cart-empty-icon" />
          <h3 className="cart-empty-title">Your cart is empty</h3>
          <p className="cart-empty-text">Add items from the marketplace to get started</p>
          <button
            onClick={() => onNavigate('marketplace')}
            className="btn btn-primary"
          >
            Browse Marketplace
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="page-title">Shopping Cart</h2>
      
      <div className="cart-layout">
        <div className="cart-items">
          {cart.map((item) => (
            <div key={item.productId} className="cart-item">
              <div className="cart-item-content">
                <div className="cart-item-info">
                  <h3 className="cart-item-name">{item.productName}</h3>
                  <p className="cart-item-vendor">{item.vendorName}</p>
                  <p className="cart-item-price">{formatCurrency(item.price)}</p>
                </div>
                <div className="cart-item-controls">
                  <div className="quantity-control">
                    <button
                      onClick={() => onUpdateQuantity(item.productId, -1)}
                      className="quantity-btn"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="quantity-value">{item.quantity}</span>
                    <button
                      onClick={() => onUpdateQuantity(item.productId, 1)}
                      className="quantity-btn"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  <button
                    onClick={() => onRemoveItem(item.productId)}
                    className="remove-btn"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
        
        <div className="order-summary">
          <h3 className="order-summary-title">Order Summary</h3>
          <div className="order-summary-items">
            <div className="order-summary-item">
              <span className="order-summary-item-label">Subtotal</span>
              <span className="order-summary-item-value">{formatCurrency(subtotal)}</span>
            </div>
            <div className="order-summary-item">
              <span className="order-summary-item-label">Tax (estimated)</span>
              <span className="order-summary-item-value">{formatCurrency(tax)}</span>
            </div>
            <div className="order-summary-total">
              <span className="order-summary-total-label">Total</span>
              <span className="order-summary-total-value">{formatCurrency(total)}</span>
            </div>
          </div>
          <div className="order-summary-actions">
            <div className="form-group">
              <label className="form-label">Cost Center</label>
              <select className="form-select">
                <option value="">Select cost center</option>
                {COST_CENTERS.map((cc) => (
                  <option key={cc.code} value={cc.code}>{cc.code} - {cc.name}</option>
                ))}
              </select>
            </div>
            <button
              onClick={onCheckout}
              className="btn btn-primary btn-full btn-lg"
            >
              Submit for Approval
            </button>
            <p className="order-summary-note">
              Orders require manager approval before processing
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Cart;

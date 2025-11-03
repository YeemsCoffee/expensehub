import React, { useState, useRef, useEffect } from 'react';
import { CheckCircle, XCircle, Eye, ChevronRight } from 'lucide-react';
import StatusBadge from './StatusBadge';
import { formatCurrency } from '../utils/helpers';

const SwipeableExpenseCard = ({ 
  expense, 
  onApprove, 
  onReject, 
  onView,
  showActions = true // Only show swipe actions for managers/admins
}) => {
  const [startX, setStartX] = useState(0);
  const [currentX, setCurrentX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [actionTriggered, setActionTriggered] = useState(null);
  const cardRef = useRef(null);

  const swipeThreshold = 100; // Pixels to trigger action
  const maxSwipe = 150; // Maximum swipe distance

  const handleTouchStart = (e) => {
    if (!showActions || expense.status !== 'pending') return;
    setStartX(e.touches[0].clientX);
    setIsDragging(true);
  };

  const handleTouchMove = (e) => {
    if (!isDragging) return;
    
    const touchX = e.touches[0].clientX;
    const diff = touchX - startX;
    
    // Limit swipe distance
    const boundedDiff = Math.max(-maxSwipe, Math.min(maxSwipe, diff));
    setCurrentX(boundedDiff);
  };

  const handleTouchEnd = () => {
    if (!isDragging) return;
    
    setIsDragging(false);

    // Trigger action if threshold exceeded
    if (currentX > swipeThreshold) {
      // Swiped right - Approve
      setActionTriggered('approve');
      setTimeout(() => {
        onApprove(expense);
        resetPosition();
      }, 300);
    } else if (currentX < -swipeThreshold) {
      // Swiped left - Reject
      setActionTriggered('reject');
      setTimeout(() => {
        onReject(expense);
        resetPosition();
      }, 300);
    } else {
      // Reset if threshold not met
      resetPosition();
    }
  };

  const resetPosition = () => {
    setCurrentX(0);
    setActionTriggered(null);
  };

  const getBackgroundColor = () => {
    if (actionTriggered === 'approve') return '#10b981';
    if (actionTriggered === 'reject') return '#ef4444';
    if (currentX > 50) return 'rgba(16, 185, 129, 0.1)';
    if (currentX < -50) return 'rgba(239, 68, 68, 0.1)';
    return 'white';
  };

  const getActionOpacity = (direction) => {
    if (direction === 'approve') {
      return Math.min(currentX / swipeThreshold, 1);
    } else {
      return Math.min(Math.abs(currentX) / swipeThreshold, 1);
    }
  };

  return (
    <div className="swipeable-expense-wrapper">
      {/* Background action indicators */}
      {showActions && expense.status === 'pending' && (
        <>
          <div 
            className="swipe-action swipe-action-left"
            style={{ opacity: getActionOpacity('approve') }}
          >
            <CheckCircle size={24} color="white" />
            <span>Approve</span>
          </div>
          <div 
            className="swipe-action swipe-action-right"
            style={{ opacity: getActionOpacity('reject') }}
          >
            <XCircle size={24} color="white" />
            <span>Reject</span>
          </div>
        </>
      )}

      {/* Swipeable card */}
      <div
        ref={cardRef}
        className={`swipeable-expense-card ${actionTriggered ? 'action-triggered' : ''}`}
        style={{
          transform: `translateX(${currentX}px)`,
          backgroundColor: getBackgroundColor(),
          transition: isDragging ? 'none' : 'all 0.3s ease'
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={() => !isDragging && onView(expense)}
      >
        <div className="expense-card-content">
          <div className="expense-card-header">
            <div className="expense-card-date">
              {new Date(expense.date).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
              })}
            </div>
            <StatusBadge status={expense.status} />
          </div>

          <div className="expense-card-main">
            <div className="expense-card-description">
              <h3>{expense.description}</h3>
              {expense.vendor_name && (
                <p className="expense-card-vendor">{expense.vendor_name}</p>
              )}
            </div>
            <div className="expense-card-amount">
              {formatCurrency(parseFloat(expense.amount))}
            </div>
          </div>

          <div className="expense-card-meta">
            <span className="expense-card-meta-item">
              <span className="meta-label">Category:</span>
              <span className="meta-value">{expense.category}</span>
            </span>
            <span className="expense-card-meta-item">
              <span className="meta-label">Cost Center:</span>
              <span className="meta-value">{expense.cost_center_code}</span>
            </span>
            {expense.is_reimbursable && (
              <span className="badge badge-warning badge-sm">Reimbursable</span>
            )}
          </div>

          <div className="expense-card-action-indicator">
            <ChevronRight size={20} color="#9ca3af" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default SwipeableExpenseCard;
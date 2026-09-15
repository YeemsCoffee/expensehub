import React from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { formatCurrency } from '../utils/helpers';

// Replaces the plain-text alert() that used to confirm a submitted expense
// report — the single highest-stakes moment in the app (money has just been
// committed on the company's behalf), so it gets real design treatment
// instead of a browser dialog.
const CheckoutSuccessModal = ({ result, onClose }) => {
  if (!result) return null;

  const { autoApproved, expenseCount, totalAmount, amazonSummary, reasonText, firstApprover } = result;
  const hasAmazonErrors = amazonSummary?.errors?.length > 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal modal-confirm modal-success"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="checkout-success-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-body modal-body-centered" style={{ flexDirection: 'column' }}>
          <div className="modal-confirm-icon success">
            <CheckCircle2 size={24} />
          </div>
          <h3 id="checkout-success-title" className="modal-confirm-title">
            {autoApproved ? 'Expenses approved' : 'Sent for approval'}
          </h3>
          <p className="modal-confirm-description">
            {autoApproved ? reasonText : `Sent to ${firstApprover} for approval.`}
          </p>
        </div>

        <div className="modal-info-section">
          <div className="modal-info-row">
            <span className="modal-info-label">Expenses created</span>
            <span className="modal-info-value">{expenseCount}</span>
          </div>
          <div className="modal-info-row">
            <span className="modal-info-label">Total</span>
            <span className="modal-info-value">{formatCurrency(totalAmount)}</span>
          </div>
          {amazonSummary && (
            <div className="modal-info-row">
              <span className="modal-info-label">Amazon orders confirmed</span>
              <span className="modal-info-value">{amazonSummary.confirmed}/{amazonSummary.total}</span>
            </div>
          )}
        </div>

        {hasAmazonErrors && (
          <div className="modal-alert modal-alert-warning" style={{ margin: '0 var(--spacing-20) var(--spacing-16)' }}>
            <AlertTriangle size={16} />
            <span>Some Amazon orders need attention: {amazonSummary.errors.join('; ')}</span>
          </div>
        )}

        <div className="modal-footer modal-footer-centered">
          <button type="button" className="btn btn-primary" onClick={onClose} autoFocus>
            View Expense History
          </button>
        </div>
      </div>
    </div>
  );
};

export default CheckoutSuccessModal;

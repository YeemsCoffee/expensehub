import React, { useEffect } from 'react';
import { AlertTriangle, LogOut, HelpCircle } from 'lucide-react';

const ICONS = {
  danger: AlertTriangle,
  warning: AlertTriangle,
  logout: LogOut,
  default: HelpCircle
};

// Shared confirm dialog for destructive/high-stakes actions (logout, checkout,
// delete) so they use the app's own modal system instead of native
// window.confirm(), which can't be styled and breaks the Coffee Ledger look.
const ConfirmModal = ({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default', // 'default' | 'danger' | 'warning' | 'logout'
  onConfirm,
  onCancel
}) => {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  const Icon = ICONS[variant] || ICONS.default;
  const iconClass = variant === 'logout' ? 'default' : variant;
  const confirmBtnClass = variant === 'danger' ? 'btn btn-danger' : 'btn btn-primary';

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal modal-confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        aria-describedby="confirm-modal-description"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-body modal-body-centered" style={{ flexDirection: 'column' }}>
          <div className={`modal-confirm-icon ${iconClass}`}>
            <Icon size={24} />
          </div>
          <h3 id="confirm-modal-title" className="modal-confirm-title">{title}</h3>
          {description && (
            <p id="confirm-modal-description" className="modal-confirm-description">{description}</p>
          )}
        </div>
        <div className="modal-footer modal-footer-centered">
          <button type="button" className="btn btn-secondary" onClick={onCancel} autoFocus>
            {cancelLabel}
          </button>
          <button type="button" className={confirmBtnClass} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;

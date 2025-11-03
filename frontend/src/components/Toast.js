import React, { useState } from 'react';
import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-react';

// Toast Context and Provider
const ToastContext = React.createContext();

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const addToast = (message, type = 'info', duration = 4000) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type, duration }]);
    
    if (duration > 0) {
      setTimeout(() => removeToast(id), duration);
    }
  };

  const removeToast = (id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  const toast = {
    success: (message, options) => {
      const duration = typeof options === 'number' ? options : options?.duration ?? 4000;
      addToast(message, 'success', duration);
    },
    error: (message, options) => {
      const duration = typeof options === 'number' ? options : options?.duration ?? 4000;
      addToast(message, 'error', duration);
    },
    info: (message, options) => {
      const duration = typeof options === 'number' ? options : options?.duration ?? 4000;
      addToast(message, 'info', duration);
    },
    warning: (message, options) => {
      const duration = typeof options === 'number' ? options : options?.duration ?? 4000;
      addToast(message, 'warning', duration);
    }
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
};

// Hook to use toast
export const useToast = () => {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
};

// Toast Container Component
const ToastContainer = ({ toasts, onRemove }) => {
  return (
    <div className="toast-container">
      {toasts.map(toast => (
        <Toast 
          key={toast.id} 
          toast={toast} 
          onClose={() => onRemove(toast.id)} 
        />
      ))}
    </div>
  );
};

// Individual Toast Component
const Toast = ({ toast, onClose }) => {
  const [isExiting, setIsExiting] = useState(false);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(onClose, 300);
  };

  const getIcon = () => {
    switch (toast.type) {
      case 'success':
        return <CheckCircle size={20} />;
      case 'error':
        return <XCircle size={20} />;
      case 'warning':
        return <AlertTriangle size={20} />;
      default:
        return <Info size={20} />;
    }
  };

  return (
    <div className={`toast toast-${toast.type} ${isExiting ? 'toast-exit' : ''}`}>
      {getIcon()}
      <span className="toast-message">{toast.message}</span>
      <button onClick={handleClose} className="toast-close" aria-label="Close">
        <X size={18} />
      </button>
    </div>
  );
};

export default ToastProvider;
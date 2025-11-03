import React from 'react';
import { CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react';
import { getStatusColor } from '../utils/helpers';

const StatusBadge = ({ status }) => {
  const getStatusIcon = (status) => {
    switch(status) {
      case 'approved': return <CheckCircle className="status-icon" />;
      case 'rejected': return <XCircle className="status-icon" />;
      case 'pending': return <Clock className="status-icon" />;
      default: return <AlertCircle className="status-icon" />;
    }
  };

  return (
    <span className={`status-badge ${getStatusColor(status)}`}>
      {getStatusIcon(status)}
      <span className="capitalize">{status}</span>
    </span>
  );
};

export default StatusBadge;

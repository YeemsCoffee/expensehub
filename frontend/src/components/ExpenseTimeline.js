import React from 'react';
import { 
  FileText, 
  Clock, 
  CheckCircle, 
  XCircle, 
  DollarSign,
  AlertCircle,
  User
} from 'lucide-react';

const ExpenseTimeline = ({ expense }) => {
  // Define timeline steps based on expense status
  const getTimelineSteps = () => {
    const steps = [
      {
        id: 'submitted',
        label: 'Submitted',
        icon: FileText,
        status: 'completed',
        date: expense.created_at,
        description: `Submitted by ${expense.submitted_by || 'Employee'}`
      },
      {
        id: 'under_review',
        label: 'Under Review',
        icon: Clock,
        status: expense.status === 'pending' ? 'current' : 
                (expense.status === 'approved' || expense.status === 'paid' || expense.status === 'rejected') ? 'completed' : 'pending',
        date: expense.reviewed_at,
        description: expense.status === 'pending' ? 'Awaiting manager approval' : 
                     expense.reviewed_by ? `Reviewed by ${expense.reviewed_by}` : 'In review'
      }
    ];

    // Add appropriate final step based on status
    if (expense.status === 'approved' || expense.status === 'paid') {
      steps.push({
        id: 'approved',
        label: 'Approved',
        icon: CheckCircle,
        status: 'completed',
        date: expense.approved_at,
        description: expense.approved_by ? `Approved by ${expense.approved_by}` : 'Approved'
      });

      if (expense.is_reimbursable) {
        steps.push({
          id: 'payment',
          label: 'Payment Processing',
          icon: DollarSign,
          status: expense.status === 'paid' ? 'completed' : 'current',
          date: expense.paid_at,
          description: expense.status === 'paid' ? 
            `Paid on ${expense.paid_at ? new Date(expense.paid_at).toLocaleDateString() : 'N/A'}` : 
            'Processing reimbursement'
        });
      }
    } else if (expense.status === 'rejected') {
      steps.push({
        id: 'rejected',
        label: 'Rejected',
        icon: XCircle,
        status: 'rejected',
        date: expense.rejected_at,
        description: expense.rejection_reason || 'Not approved'
      });
    } else {
      // Add pending steps for incomplete workflows
      steps.push({
        id: 'approval',
        label: 'Approval',
        icon: CheckCircle,
        status: 'pending',
        date: null,
        description: 'Pending approval'
      });

      if (expense.is_reimbursable) {
        steps.push({
          id: 'payment',
          label: 'Payment',
          icon: DollarSign,
          status: 'pending',
          date: null,
          description: 'Pending reimbursement'
        });
      }
    }

    return steps;
  };

  const steps = getTimelineSteps();

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return '#10b981'; // Green
      case 'current':
        return '#3b82f6'; // Blue
      case 'rejected':
        return '#ef4444'; // Red
      default:
        return '#d1d5db'; // Gray
    }
  };

  const getIconColor = (status) => {
    switch (status) {
      case 'completed':
        return '#10b981';
      case 'current':
        return '#3b82f6';
      case 'rejected':
        return '#ef4444';
      default:
        return '#9ca3af';
    }
  };

  return (
    <div className="expense-timeline">
      {steps.map((step, index) => {
        const Icon = step.icon;
        const isLast = index === steps.length - 1;

        return (
          <div key={step.id} className="timeline-step">
            <div className="timeline-step-indicator">
              <div 
                className={`timeline-icon ${step.status}`}
                style={{ 
                  backgroundColor: step.status === 'completed' || step.status === 'rejected' || step.status === 'current' 
                    ? getStatusColor(step.status) 
                    : '#fff',
                  borderColor: getStatusColor(step.status)
                }}
              >
                <Icon 
                  size={20} 
                  color={step.status === 'pending' ? getIconColor(step.status) : '#fff'} 
                />
              </div>
              {!isLast && (
                <div 
                  className="timeline-connector"
                  style={{
                    backgroundColor: step.status === 'completed' || step.status === 'rejected' 
                      ? getStatusColor(step.status) 
                      : '#e5e7eb'
                  }}
                />
              )}
            </div>
            <div className="timeline-step-content">
              <div className="timeline-step-header">
                <h4 className="timeline-step-title">{step.label}</h4>
                {step.date && (
                  <span className="timeline-step-date">
                    {new Date(step.date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </span>
                )}
              </div>
              <p className="timeline-step-description">{step.description}</p>
              
              {/* Show rejection reason if rejected */}
              {step.status === 'rejected' && expense.rejection_reason && (
                <div className="timeline-rejection-reason">
                  <AlertCircle size={14} />
                  <span>{expense.rejection_reason}</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ExpenseTimeline;
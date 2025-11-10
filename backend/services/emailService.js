const { EmailClient } = require('@azure/communication-email');

// Create Azure Email client
const createEmailClient = () => {
  const connectionString = process.env.AZURE_COMMUNICATION_CONNECTION_STRING;
  return new EmailClient(connectionString);
};

// Send expense submission notification to manager
const sendExpenseSubmissionNotification = async (expenseData, managerData, submitterData) => {
  // Check if email is enabled
  if (process.env.EMAIL_ENABLED !== 'true') {
    console.log('Email notifications are disabled. Set EMAIL_ENABLED=true in .env to enable.');
    return { success: false, message: 'Email disabled' };
  }

  try {
    const emailClient = createEmailClient();

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">New Expense Requires Your Approval</h2>

        <p>Hello ${managerData.name},</p>

        <p>A new expense has been submitted and requires your approval.</p>

        <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #555;">Expense Details</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #666;"><strong>Submitted By:</strong></td>
              <td style="padding: 8px 0;">${submitterData.name}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666;"><strong>Date:</strong></td>
              <td style="padding: 8px 0;">${new Date(expenseData.date).toLocaleDateString()}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666;"><strong>Amount:</strong></td>
              <td style="padding: 8px 0;">$${parseFloat(expenseData.amount).toFixed(2)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666;"><strong>Category:</strong></td>
              <td style="padding: 8px 0;">${expenseData.category}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666;"><strong>Description:</strong></td>
              <td style="padding: 8px 0;">${expenseData.description}</td>
            </tr>
            ${expenseData.vendor_name ? `
            <tr>
              <td style="padding: 8px 0; color: #666;"><strong>Vendor:</strong></td>
              <td style="padding: 8px 0;">${expenseData.vendor_name}</td>
            </tr>
            ` : ''}
            ${expenseData.notes ? `
            <tr>
              <td style="padding: 8px 0; color: #666;"><strong>Notes:</strong></td>
              <td style="padding: 8px 0;">${expenseData.notes}</td>
            </tr>
            ` : ''}
          </table>
        </div>

        <p style="margin: 20px 0;">
          <a href="${process.env.FRONTEND_URL}/#approvals?expenseId=${expenseData.id}"
             style="background-color: #007bff; color: white; padding: 12px 24px;
                    text-decoration: none; border-radius: 5px; display: inline-block;">
            Review & Approve Expense
          </a>
        </p>

        <p style="color: #666; font-size: 14px; margin-top: 30px;">
          This is an automated notification from ExpenseHub. Please do not reply to this email.
        </p>
      </div>
    `;

    const message = {
      senderAddress: process.env.AZURE_SENDER_EMAIL || 'DoNotReply@yeemscoffee.com',
      content: {
        subject: `New Expense Submitted for Approval - ${submitterData.name}`,
        html: htmlContent,
      },
      recipients: {
        to: [
          {
            address: managerData.email,
            displayName: managerData.name,
          },
        ],
      },
    };

    const poller = await emailClient.beginSend(message);
    const result = await poller.pollUntilDone();

    console.log('Email sent successfully:', result.id);
    return { success: true, messageId: result.id };
  } catch (error) {
    console.error('Error sending email:', error);
    return { success: false, error: error.message };
  }
};

// Send expense approval notification to submitter
const sendExpenseApprovalNotification = async (expenseData, submitterData, approverData) => {
  if (process.env.EMAIL_ENABLED !== 'true') {
    console.log('Email notifications are disabled.');
    return { success: false, message: 'Email disabled' };
  }

  try {
    const emailClient = createEmailClient();

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #28a745;">Expense Approved</h2>

        <p>Hello ${submitterData.name},</p>

        <p>Your expense has been approved by ${approverData.name}.</p>

        <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #555;">Expense Details</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #666;"><strong>Date:</strong></td>
              <td style="padding: 8px 0;">${new Date(expenseData.date).toLocaleDateString()}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666;"><strong>Amount:</strong></td>
              <td style="padding: 8px 0;">$${parseFloat(expenseData.amount).toFixed(2)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666;"><strong>Category:</strong></td>
              <td style="padding: 8px 0;">${expenseData.category}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666;"><strong>Description:</strong></td>
              <td style="padding: 8px 0;">${expenseData.description}</td>
            </tr>
          </table>
        </div>

        <p style="color: #666; font-size: 14px; margin-top: 30px;">
          This is an automated notification from ExpenseHub. Please do not reply to this email.
        </p>
      </div>
    `;

    const message = {
      senderAddress: process.env.AZURE_SENDER_EMAIL || 'DoNotReply@yeemscoffee.com',
      content: {
        subject: `Expense Approved - $${parseFloat(expenseData.amount).toFixed(2)}`,
        html: htmlContent,
      },
      recipients: {
        to: [
          {
            address: submitterData.email,
            displayName: submitterData.name,
          },
        ],
      },
    };

    const poller = await emailClient.beginSend(message);
    const result = await poller.pollUntilDone();

    console.log('Approval email sent successfully:', result.id);
    return { success: true, messageId: result.id };
  } catch (error) {
    console.error('Error sending approval email:', error);
    return { success: false, error: error.message };
  }
};

// Send expense rejection notification to submitter
const sendExpenseRejectionNotification = async (expenseData, submitterData, rejectorData, rejectionReason) => {
  if (process.env.EMAIL_ENABLED !== 'true') {
    console.log('Email notifications are disabled.');
    return { success: false, message: 'Email disabled' };
  }

  try {
    const emailClient = createEmailClient();

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc3545;">Expense Rejected</h2>

        <p>Hello ${submitterData.name},</p>

        <p>Your expense has been rejected by ${rejectorData.name}.</p>

        <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #555;">Expense Details</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #666;"><strong>Date:</strong></td>
              <td style="padding: 8px 0;">${new Date(expenseData.date).toLocaleDateString()}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666;"><strong>Amount:</strong></td>
              <td style="padding: 8px 0;">$${parseFloat(expenseData.amount).toFixed(2)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666;"><strong>Category:</strong></td>
              <td style="padding: 8px 0;">${expenseData.category}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666;"><strong>Description:</strong></td>
              <td style="padding: 8px 0;">${expenseData.description}</td>
            </tr>
          </table>
        </div>

        ${rejectionReason ? `
        <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0;">
          <h4 style="margin-top: 0; color: #856404;">Rejection Reason:</h4>
          <p style="color: #856404; margin: 0;">${rejectionReason}</p>
        </div>
        ` : ''}

        <p style="margin: 20px 0;">
          <a href="${process.env.FRONTEND_URL}/#expenses-history"
             style="background-color: #6c757d; color: white; padding: 12px 24px;
                    text-decoration: none; border-radius: 5px; display: inline-block;">
            View Expense History
          </a>
        </p>

        <p style="color: #666; font-size: 14px; margin-top: 30px;">
          This is an automated notification from ExpenseHub. Please do not reply to this email.
        </p>
      </div>
    `;

    const message = {
      senderAddress: process.env.AZURE_SENDER_EMAIL || 'DoNotReply@yeemscoffee.com',
      content: {
        subject: `Expense Rejected - $${parseFloat(expenseData.amount).toFixed(2)}`,
        html: htmlContent,
      },
      recipients: {
        to: [
          {
            address: submitterData.email,
            displayName: submitterData.name,
          },
        ],
      },
    };

    const poller = await emailClient.beginSend(message);
    const result = await poller.pollUntilDone();

    console.log('Rejection email sent successfully:', result.id);
    return { success: true, messageId: result.id };
  } catch (error) {
    console.error('Error sending rejection email:', error);
    return { success: false, error: error.message };
  }
};

// Send password reset email
const sendPasswordResetEmail = async (userData, resetToken) => {
  if (process.env.EMAIL_ENABLED !== 'true') {
    console.log('Email notifications are disabled.');
    return { success: false, message: 'Email disabled' };
  }

  try {
    const emailClient = createEmailClient();

    // Create reset link with token
    const resetLink = `${process.env.FRONTEND_URL}/#/reset-password?token=${resetToken}`;

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Password Reset Request</h2>

        <p>Hello ${userData.name},</p>

        <p>We received a request to reset your password for your ExpenseHub account.</p>

        <p style="margin: 20px 0;">
          <a href="${resetLink}"
             style="background-color: #007bff; color: white; padding: 12px 24px;
                    text-decoration: none; border-radius: 5px; display: inline-block;">
            Reset Your Password
          </a>
        </p>

        <p style="color: #666; font-size: 14px;">
          Or copy and paste this link into your browser:
        </p>
        <p style="color: #007bff; font-size: 14px; word-break: break-all;">
          ${resetLink}
        </p>

        <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0;">
          <p style="color: #856404; margin: 0;">
            <strong>Important:</strong> This link will expire in 1 hour for security reasons.
          </p>
        </div>

        <p style="color: #666; font-size: 14px;">
          If you didn't request a password reset, please ignore this email. Your password will remain unchanged.
        </p>

        <p style="color: #666; font-size: 14px; margin-top: 30px;">
          This is an automated notification from ExpenseHub. Please do not reply to this email.
        </p>
      </div>
    `;

    const message = {
      senderAddress: process.env.AZURE_SENDER_EMAIL || 'DoNotReply@yeemscoffee.com',
      content: {
        subject: 'Password Reset Request - ExpenseHub',
        html: htmlContent,
      },
      recipients: {
        to: [
          {
            address: userData.email,
            displayName: userData.name,
          },
        ],
      },
    };

    const poller = await emailClient.beginSend(message);
    const result = await poller.pollUntilDone();

    console.log('Password reset email sent successfully:', result.id);
    return { success: true, messageId: result.id };
  } catch (error) {
    console.error('Error sending password reset email:', error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendExpenseSubmissionNotification,
  sendExpenseApprovalNotification,
  sendExpenseRejectionNotification,
  sendPasswordResetEmail,
};

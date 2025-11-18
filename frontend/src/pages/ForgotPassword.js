import React, { useState } from 'react';
import { Building2, ArrowLeft } from 'lucide-react';
import api from '../services/api';
import '../styles/auth.css';

const ForgotPassword = ({ onNavigateToLogin }) => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await api.post('/auth/forgot-password', { email });
      setSuccess(true);
      setEmail('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send password reset email. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleBackToLogin = (e) => {
    e.preventDefault();
    window.location.hash = '';
    if (onNavigateToLogin) {
      onNavigateToLogin();
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <div className="login-header">
          <Building2 size={40} className="login-icon" />
          <h1>Forgot Password</h1>
          <p className="login-subtitle">
            Enter your email address and we'll send you a link to reset your password.
          </p>
        </div>

        {success ? (
          <div className="success-message">
            <h3>Check Your Email</h3>
            <p>
              If an account exists with this email, a password reset link has been sent.
              Please check your inbox and follow the instructions.
            </p>
            <p style={{ fontSize: '14px', color: '#666', marginTop: '10px' }}>
              The link will expire in 1 hour for security reasons.
            </p>
            <button
              onClick={handleBackToLogin}
              className="btn btn-primary btn-full"
              style={{ marginTop: '20px' }}
            >
              Back to Login
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="login-form">
            {error && (
              <div className="error-message">
                {error}
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input
                type="email"
                className="form-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                placeholder="your.email@yeemscoffee.com"
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-full btn-lg"
              disabled={loading}
            >
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>

            <div className="login-footer">
              <p>
                <button type="button" className="btn-link" onClick={handleBackToLogin} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#007bff', textDecoration: 'underline' }}>
                  <ArrowLeft size={14} style={{ verticalAlign: 'middle', marginRight: '5px' }} />
                  Back to Login
                </button>
              </p>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default ForgotPassword;

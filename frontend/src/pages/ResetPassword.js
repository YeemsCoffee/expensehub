import React, { useState, useEffect } from 'react';
import { Building2, Eye, EyeOff } from 'lucide-react';
import api from '../services/api';
import '../styles/auth.css';

const ResetPassword = ({ onNavigateToLogin }) => {
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [validatingToken, setValidatingToken] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);

  useEffect(() => {
    // Extract token from URL hash
    const urlParams = new URLSearchParams(window.location.hash.split('?')[1]);
    const tokenFromUrl = urlParams.get('token');

    if (!tokenFromUrl) {
      setError('Invalid or missing reset token. Please request a new password reset.');
      setValidatingToken(false);
      return;
    }

    setToken(tokenFromUrl);

    // Validate token
    const validateToken = async () => {
      try {
        const { data } = await api.get(`/auth/validate-reset-token/${tokenFromUrl}`);
        if (data.valid) {
          setTokenValid(true);
        } else {
          setError('Invalid or expired reset token. Please request a new password reset.');
        }
      } catch (err) {
        setError(err.response?.data?.error || 'Invalid or expired reset token. Please request a new password reset.');
      } finally {
        setValidatingToken(false);
      }
    };

    validateToken();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validation
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      await api.post('/auth/reset-password', {
        token,
        newPassword
      });
      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to reset password. Please try again.');
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

  if (validatingToken) {
    return (
      <div className="login-container">
        <div className="login-box">
          <div className="login-header">
            <Building2 size={40} className="login-icon" />
            <h1>Validating Token...</h1>
            <p className="login-subtitle">Please wait while we verify your reset link.</p>
          </div>
        </div>
      </div>
    );
  }

  if (!tokenValid && !validatingToken) {
    return (
      <div className="login-container">
        <div className="login-box">
          <div className="login-header">
            <Building2 size={40} className="login-icon" />
            <h1>Invalid Reset Link</h1>
          </div>

          <div className="error-message">
            {error || 'This password reset link is invalid or has expired.'}
          </div>

          <div style={{ marginTop: '20px' }}>
            <button
              onClick={handleBackToLogin}
              className="btn btn-primary btn-full"
            >
              Back to Login
            </button>
            <div className="login-footer">
              <p>
                <button type="button" onClick={(e) => {
                  e.preventDefault();
                  window.location.hash = 'forgot-password';
                }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#007bff', textDecoration: 'underline' }}>
                  Request New Reset Link
                </button>
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="login-container">
        <div className="login-box">
          <div className="login-header">
            <Building2 size={40} className="login-icon" />
            <h1>Password Reset Successful</h1>
          </div>

          <div className="success-message">
            <p>
              Your password has been successfully reset. You can now log in with your new password.
            </p>
          </div>

          <button
            onClick={handleBackToLogin}
            className="btn btn-primary btn-full"
            style={{ marginTop: '20px' }}
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="login-container">
      <div className="login-box">
        <div className="login-header">
          <Building2 size={40} className="login-icon" />
          <h1>Reset Your Password</h1>
          <p className="login-subtitle">
            Please enter your new password below.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <div className="form-group">
            <label className="form-label">New Password</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                className="form-input"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                disabled={loading}
                placeholder="Enter new password (min. 6 characters)"
                style={{ paddingRight: '40px' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '5px',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                {showPassword ? <EyeOff size={18} color="#666" /> : <Eye size={18} color="#666" />}
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Confirm New Password</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                className="form-input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                disabled={loading}
                placeholder="Confirm new password"
                style={{ paddingRight: '40px' }}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '5px',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                {showConfirmPassword ? <EyeOff size={18} color="#666" /> : <Eye size={18} color="#666" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-full btn-lg"
            disabled={loading}
          >
            {loading ? 'Resetting...' : 'Reset Password'}
          </button>

          <div className="login-footer">
            <p>
              <button type="button" onClick={handleBackToLogin} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#007bff', textDecoration: 'underline' }}>
                Back to Login
              </button>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ResetPassword;

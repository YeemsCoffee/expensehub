import React, { useState } from 'react';
import { Building2 } from 'lucide-react';
import api from '../services/api';

const Login = ({ onLoginSuccess, onNavigateToRegister }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await api.post('/auth/login', {
        email,
        password
      });

      // Save token and user info
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.user));

      // Call parent callback to update app state
      onLoginSuccess(response.data.user);
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Please try again.');
      setLoading(false);
    }
  };

  const handleSignUpClick = (e) => {
    e.preventDefault();
    if (onNavigateToRegister) {
      onNavigateToRegister();
    } else {
      window.location.hash = 'register';
    }
  };

  const handleForgotPasswordClick = (e) => {
    e.preventDefault();
    window.location.hash = 'forgot-password';
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <div className="login-header">
          <Building2 className="login-icon" />
          <h1>ExpenseHub</h1>
          <p>Yeem's Coffee Procurement System</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <h2>Sign In</h2>
          
          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="form-input"
              placeholder="you@yeemscoffee.com"
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="form-input"
              placeholder="Enter your password"
              required
            />
          </div>

          <div style={{ textAlign: 'right', marginBottom: '15px' }}>
            <a href="#" onClick={handleForgotPasswordClick} style={{ fontSize: '14px', color: '#007bff', textDecoration: 'none' }}>
              Forgot Password?
            </a>
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-full btn-lg"
            disabled={loading}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>

          <div className="login-footer">
            <p>Don't have an account? <a href="#" onClick={handleSignUpClick}>Sign up</a></p>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;
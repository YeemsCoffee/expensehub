import React, { useState } from 'react';
import { Building2 } from 'lucide-react';
import api from '../services/api';

const ALLOWED_DOMAIN = 'yeemscoffee.com';

const Register = ({ onRegisterSuccess, onNavigateToLogin }) => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
    employeeId: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const validateEmail = (email) => {
    const domain = email.split('@')[1];
    return domain === ALLOWED_DOMAIN;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validate email domain
    if (!validateEmail(formData.email)) {
      setError(`Only ${ALLOWED_DOMAIN} email addresses are allowed to register.`);
      return;
    }

    // Validate passwords match
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    // Validate password length
    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    setLoading(true);

    try {
      const response = await api.post('/auth/register', {
        email: formData.email,
        password: formData.password,
        firstName: formData.firstName,
        lastName: formData.lastName,
        employeeId: formData.employeeId
      });

      // Save token and user info
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.user));

      // Call parent callback to update app state
      onRegisterSuccess(response.data.user);
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed. Please try again.');
      setLoading(false);
    }
  };

  const handleSignInClick = (e) => {
    e.preventDefault();
    if (onNavigateToLogin) {
      onNavigateToLogin();
    } else {
      window.location.hash = 'login';
    }
  };

  return (
    <div className="login-container">
      <div className="login-box register-box">
        <div className="login-header">
          <Building2 className="login-icon" />
          <h1>ExpenseHub</h1>
          <p>Yeem's Coffee Procurement System</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <h2>Create Account</h2>
          
          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">First Name</label>
              <input
                type="text"
                name="firstName"
                value={formData.firstName}
                onChange={handleChange}
                className="form-input"
                placeholder="John"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Last Name</label>
              <input
                type="text"
                name="lastName"
                value={formData.lastName}
                onChange={handleChange}
                className="form-input"
                placeholder="Doe"
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Email Address (must be @yeemscoffee.com)</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className="form-input"
              placeholder="john.doe@yeemscoffee.com"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Employee ID</label>
            <input
              type="text"
              name="employeeId"
              value={formData.employeeId}
              onChange={handleChange}
              className="form-input"
              placeholder="E12345"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password (min 6 characters)</label>
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              className="form-input"
              placeholder="Enter password"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Confirm Password</label>
            <input
              type="password"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              className="form-input"
              placeholder="Re-enter password"
              required
            />
          </div>

          <button 
            type="submit" 
            className="btn btn-primary btn-full btn-lg"
            disabled={loading}
          >
            {loading ? 'Creating account...' : 'Create Account'}
          </button>

          <div className="login-footer">
            <p>Already have an account? <a href="#" onClick={handleSignInClick}>Sign in</a></p>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Register;
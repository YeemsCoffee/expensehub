import axios from 'axios';

// For production, use relative URL /api (same domain)
// For development, use localhost:5000
const getApiBaseUrl = () => {
  // Check if REACT_APP_API_URL is explicitly set
  if (process.env.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL;
  }

  // Fallback based on NODE_ENV
  if (process.env.NODE_ENV === 'production') {
    return '/api';
  }

  // Development default
  return 'http://localhost:5000/api';
};

const API_BASE_URL = getApiBaseUrl();

console.log('Environment:', process.env.NODE_ENV);
console.log('REACT_APP_API_URL:', process.env.REACT_APP_API_URL);
console.log('API Base URL:', API_BASE_URL);

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add token to requests automatically
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Handle authentication errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Check if this request has skipAutoLogout flag
      const skipAutoLogout = error.config?.skipAutoLogout;

      // Check if we're in the middle of an OAuth flow (Xero callback)
      const isOAuthCallback = window.location.hash.includes('connected=true') ||
                               window.location.hash.includes('connected=false');

      // Check if we're on the Xero settings page (where auth issues are expected)
      const isXeroPage = window.location.hash.includes('xero-settings');

      // Don't log out in these cases
      if (!skipAutoLogout && !isOAuthCallback && !isXeroPage) {
        // Token expired or invalid
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        // Redirect to login
        window.location.hash = '';
        window.location.reload();
      }
    }
    return Promise.reject(error);
  }
);

export default api;
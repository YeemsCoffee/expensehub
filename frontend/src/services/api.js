import axios from 'axios';

// Determine API base URL based on environment
// In production (Render), frontend and backend are on same domain, use relative /api
// In development (localhost), use full URL to backend
const getApiBaseUrl = () => {
  // Check if we're running on localhost (development)
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:5000/api';
  }
  // Production: use relative path (same domain)
  return '/api';
};

const API_BASE_URL = getApiBaseUrl();

console.log('Environment:', {
  hostname: window.location.hostname,
  apiBaseUrl: API_BASE_URL,
  nodeEnv: process.env.NODE_ENV,
  reactAppApiUrl: process.env.REACT_APP_API_URL
});

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
      // Token expired or invalid
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      // Optionally redirect to login
      // window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
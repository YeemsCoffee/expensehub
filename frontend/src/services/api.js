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

// Handle authentication errors and transient rate limiting
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    // A page can fire several widget requests at once (cart, expenses, dashboard
    // stats, reference data). A single burst can trip the shared rate limit even
    // though nothing is actually wrong, so retry once after a short backoff before
    // surfacing it as a real error.
    if (error.response?.status === 429 && !error.config?._retried429) {
      error.config._retried429 = true;
      const retryAfterHeader = error.response.headers?.['retry-after'];
      const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : 1500;
      await new Promise((resolve) => setTimeout(resolve, Math.min(retryAfterMs, 5000)));
      return api(error.config);
    }

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
        localStorage.removeItem('role');
        // Redirect to login without reload to prevent page hang
        window.location.hash = '#login';
        // Only reload after a short delay to allow hash change to process
        setTimeout(() => {
          window.location.reload();
        }, 100);
      }
    }
    return Promise.reject(error);
  }
);

export default api;
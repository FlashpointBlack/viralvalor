import axios from 'axios';
import { sanitizeObject } from './textUtils';

// Apply a global response interceptor
axios.interceptors.response.use(
  (response) => {
    // Sanitize only if data exists
    if (response && response.data) {
      response.data = sanitizeObject(response.data);
    }
    return response;
  },
  (error) => Promise.reject(error)
);

// No exports needed – importing this file once sets up the interceptor. 
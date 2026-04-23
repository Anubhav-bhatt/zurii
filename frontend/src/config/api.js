// Central API configuration
// In development: uses localhost:5001
// In production: uses VITE_API_URL environment variable
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

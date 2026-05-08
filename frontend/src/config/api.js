// Central API configuration
// In development: uses localhost:5001
// In production: uses VITE_API_URL environment variable
const normalizeBaseUrl = (value) => String(value || '').trim().replace(/\/+$/, '');

const envBaseUrl = normalizeBaseUrl(import.meta.env.VITE_API_URL);

// Production fallback is same-origin so deployments behind a reverse proxy keep working.
export const API_BASE_URL = envBaseUrl || (import.meta.env.DEV ? 'http://localhost:5001' : '');

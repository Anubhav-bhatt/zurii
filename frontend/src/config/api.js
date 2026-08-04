// Central API configuration
//
// Unset        → http://localhost:5001 (local `npm run dev` default)
// Empty string → same-origin relative paths (/api/...), used by the Docker
//                image, where nginx proxies /api/ to the backend
// Absolute URL → that origin (backend hosted on a separate domain)
//
// Note `??` rather than `||`: an empty string is falsy, so `||` would discard
// the deliberate same-origin setting and fall back to localhost.
export const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:5001';

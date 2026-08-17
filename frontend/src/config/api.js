// Central API configuration
//
//   unset, `npm run dev`   → http://localhost:5001 (the local default)
//   unset, `npm run build` → '' — same-origin /api/..., via the deployment's proxy
//   empty string           → same-origin relative paths, stated explicitly
//   absolute URL           → that origin; the browser calls the backend directly
//
// `import.meta.env.PROD` is what separates the first two, and it follows
// NODE_ENV rather than `--mode`: any `vite build` is a production build unless
// NODE_ENV says otherwise, and the dev server is the only case that is not.
//
// Note `??` rather than `||`: an empty string is falsy, so `||` would discard
// the deliberate same-origin setting and fall back to localhost.
//
// WHY THE UNSET DEFAULT DEPENDS ON THE BUILD MODE
//
// Every production deployment in this repository puts a proxy in front of the
// API on the frontend's own origin — nginx forwards /api/ in the Docker image,
// and frontend/vercel.json rewrites /api/:path* to the Render service. In both,
// the correct value is the empty string, and `http://localhost:5001` is not a
// fallback so much as a guarantee that nothing works: the bundle is served from
// a public host and asks the visitor's own machine for the API.
//
// That mattered here because VITE_* variables are read at BUILD time and
// frontend/.env is gitignored, so a build host has no value for this unless
// someone set one in a dashboard. Defaulting to localhost meant the safe
// configuration — leave it unset — produced the one bundle that cannot work,
// while the two settings that do work both had to be remembered by hand.
//
// THE SAME-ORIGIN PROXY IS NOT A PERFORMANCE DETAIL. It is what keeps the
// refresh cookie first-party. Pointing this at the backend's own origin
// (https://…onrender.com) makes every admin call cross-site from the browser's
// point of view, and a SameSite=Lax cookie is then not sent at all — so login
// succeeds, the dashboard works for fifteen minutes on the in-memory access
// token, and every page reload lands on the login screen. Setting this to an
// absolute cross-site origin therefore also requires COOKIE_SAMESITE=none on
// the backend; see the note on REFRESH_COOKIE_OPTIONS in backend/server.js.
//
// An explicitly provided VITE_API_URL still wins, in either mode. A dashboard
// variable left over from an earlier topology overrides everything below it.
export const API_BASE_URL =
  import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? '' : 'http://localhost:5001');

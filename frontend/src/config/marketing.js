/**
 * Meta Pixel configuration. A Pixel ID is a public identifier — it is visible
 * to anyone who opens a page that loads the Pixel — not a secret.
 *
 *   VITE_META_PIXEL_ID set       that ID; an empty or non-numeric value disables the Pixel
 *   unset, production build      the approved Zurii Pixel
 *   unset, dev server and tests  disabled
 *
 * Even when configured, nothing loads until a visitor allows marketing
 * cookies (services/consent.js), and never on admin pages.
 */
const APPROVED_PIXEL_ID = '4858424197723199';

const env = import.meta.env ?? {};
const configured = env.VITE_META_PIXEL_ID;

function resolvePixelId() {
  if (configured === undefined) return env.PROD ? APPROVED_PIXEL_ID : '';
  const value = String(configured).trim();
  return /^\d{6,20}$/.test(value) ? value : '';
}

export const META_PIXEL_ID = resolvePixelId();

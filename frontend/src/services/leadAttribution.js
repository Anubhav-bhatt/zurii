/**
 * First-party marketing attribution for enquiries (ZT-16).
 *
 * What is recorded, in this browser only:
 *   - UTM tags (utm_source, utm_medium, utm_campaign, utm_content, utm_term)
 *   - the referring site's HOST (never its full URL)
 *   - the landing page's PATH (never its query string)
 *   - whether the landing URL carried a Google (gclid) or Meta (fbclid) click
 *     id — the TYPE only; the identifier itself is never read into storage
 *
 * When it is kept:
 *   - for this browsing session (sessionStorage), always — it is sent only
 *     with an enquiry the visitor chooses to submit, to the Zurii server, and
 *     never to Meta or anyone else;
 *   - for 30 days across visits (localStorage) ONLY while the visitor allows
 *     marketing cookies. Withdrawing consent deletes it at once.
 *
 * The data lives in the visitor's own browser and travels only with their own
 * submission, so one visitor's campaign can never be attached to another's
 * lead. Every function here is storage-safe and never throws: attribution must
 * never cost an enquiry. The server re-validates everything
 * (backend/lib/attribution.js).
 */
import { getMarketingConsent, subscribeConsent } from './consent.js';

export const SESSION_KEY = 'zurii_attribution';
export const PERSIST_KEY = 'zurii_attribution_last';
export const PERSIST_DAYS = 30;
const UTM = [
  ['utm_source', 'utmSource'],
  ['utm_medium', 'utmMedium'],
  ['utm_campaign', 'utmCampaign'],
  ['utm_content', 'utmContent'],
  ['utm_term', 'utmTerm'],
];
const VALUE_MAX = 100;
const DAY_MS = 24 * 60 * 60 * 1000;

function store(kind) {
  try {
    return globalThis[kind] ?? null;
  } catch {
    return null;
  }
}
function read(kind, key) {
  try {
    const raw = store(kind)?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function write(kind, key, value) {
  try {
    store(kind)?.setItem(key, JSON.stringify(value));
  } catch {
    // full or blocked storage: this visit simply goes unattributed
  }
}
function remove(kind, key) {
  try {
    store(kind)?.removeItem(key);
  } catch {
    // nothing stored, or nothing we can do
  }
}

/** The attribution a landing URL and its referrer carry. Pure; exported for tests. */
export function touchFromLocation(href, referrer) {
  let url;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  const touch = { landingPage: url.pathname.slice(0, 255) };
  for (const [param, key] of UTM) {
    const value = url.searchParams.get(param);
    if (value && value.trim()) touch[key] = value.trim().slice(0, VALUE_MAX);
  }
  if (url.searchParams.has('gclid')) touch.clickIdType = 'gclid';
  else if (url.searchParams.has('fbclid')) touch.clickIdType = 'fbclid';
  try {
    const ref = referrer ? new URL(referrer) : null;
    if (ref && /^https?:$/.test(ref.protocol) && ref.hostname !== url.hostname) touch.referrerHost = ref.hostname.toLowerCase();
  } catch {
    // an unreadable referrer is just no referrer
  }
  return touch;
}

const isCampaign = (t) => Boolean(t && (t.utmSource || t.utmMedium || t.utmCampaign || t.clickIdType));
const isNonDirect = (t) => Boolean(t && (isCampaign(t) || t.referrerHost));

/**
 * Record where this visit came from. Called once per full page load, before
 * the app renders — a client-side redirect would otherwise drop the landing
 * URL's tags. The session's first page is its landing page; a later campaign
 * click in the same tab (another ad) replaces it. Reloads change nothing.
 */
export function captureAttribution({ href = globalThis.location?.href, referrer = globalThis.document?.referrer, now = Date.now() } = {}) {
  try {
    const touch = touchFromLocation(href, referrer);
    if (!touch) return;
    if (!read('sessionStorage', SESSION_KEY) || isCampaign(touch)) write('sessionStorage', SESSION_KEY, { ...touch, at: now });
    if (getMarketingConsent() === 'granted' && isNonDirect(touch)) write('localStorage', PERSIST_KEY, { ...touch, at: now });
  } catch {
    // never let attribution break the page
  }
}

/** Consent changed: keep the cross-visit copy only while marketing is allowed. */
export function applyConsent(choice) {
  if (choice === 'granted') {
    const session = read('sessionStorage', SESSION_KEY);
    if (isNonDirect(session)) write('localStorage', PERSIST_KEY, session);
  } else {
    remove('localStorage', PERSIST_KEY);
  }
}

/**
 * `{ attribution }` for an enquiry payload, or `{}` when nothing was captured.
 * This session's campaign or referral first; otherwise — only with marketing
 * consent — the last campaign or referral within 30 days; otherwise this
 * session's direct visit.
 */
export function leadAttribution({ now = Date.now() } = {}) {
  try {
    const session = read('sessionStorage', SESSION_KEY);
    let touch = session;
    if (!isNonDirect(session)) {
      const last = getMarketingConsent() === 'granted' ? read('localStorage', PERSIST_KEY) : null;
      if (last && now - Number(last.at ?? 0) <= PERSIST_DAYS * DAY_MS) touch = last;
      else if (last) remove('localStorage', PERSIST_KEY);
    }
    if (!touch) return {};
    const fields = {};
    for (const key of ['utmSource', 'utmMedium', 'utmCampaign', 'utmContent', 'utmTerm', 'referrerHost', 'landingPage', 'clickIdType']) {
      if (typeof touch[key] === 'string' && touch[key]) fields[key] = touch[key];
    }
    return { attribution: fields };
  } catch {
    return {};
  }
}

if (typeof window !== 'undefined') subscribeConsent(applyConsent);

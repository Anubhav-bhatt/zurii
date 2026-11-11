/**
 * Marketing consent (opt-in). One value, kept in localStorage:
 *
 *   'granted'  the visitor allowed ads measurement (Meta Pixel)
 *   'denied'   the visitor declined, or withdrew an earlier yes
 *   'unset'    no choice yet — treated exactly like 'denied'
 *
 * Nothing is sent to Meta unless the value is 'granted' (services/marketing.js).
 * The record holds only the choice and when it was made. If storage is blocked
 * the choice lasts for the current page only, and the banner asks again later.
 */
export const CONSENT_STORAGE_KEY = 'zurii_marketing_consent';

const CHOICES = new Set(['granted', 'denied']);
const listeners = new Set();
const panelListeners = new Set();
let memoryChoice = null;

function storage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function getMarketingConsent() {
  try {
    const raw = storage()?.getItem(CONSENT_STORAGE_KEY);
    if (raw) {
      const choice = JSON.parse(raw)?.marketing;
      if (CHOICES.has(choice)) return choice;
    }
  } catch {
    // unreadable or blocked storage: fall back to this page's choice
  }
  return memoryChoice ?? 'unset';
}

export function setMarketingConsent(choice) {
  if (!CHOICES.has(choice)) throw new Error(`Unknown consent choice: ${choice}`);
  memoryChoice = choice;
  try {
    storage()?.setItem(
      CONSENT_STORAGE_KEY,
      JSON.stringify({ version: 1, marketing: choice, updatedAt: new Date().toISOString() })
    );
  } catch {
    // storage full or blocked: the in-memory choice still applies to this page
  }
  notify();
}

function notify() {
  const choice = getMarketingConsent();
  for (const listener of listeners) listener(choice);
}

/** Subscribe to consent changes (this tab and others). Returns an unsubscribe. */
export function subscribeConsent(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// A choice made in another tab applies here too — withdrawing consent there
// must stop events from this tab as well.
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('storage', (event) => {
    if (event.key === CONSENT_STORAGE_KEY) notify();
  });
}

/** Ask the consent banner to reopen for review (Footer, privacy policy). */
export function openConsentPreferences() {
  for (const listener of panelListeners) listener();
}

export function onOpenConsentPreferences(listener) {
  panelListeners.add(listener);
  return () => panelListeners.delete(listener);
}

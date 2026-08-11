/**
 * The only place that touches `localStorage`.
 *
 * Everything here is defensive by design: storage can be absent (SSR, older
 * WebViews), blocked (Safari private mode), full (quota) or hold a value some
 * previous version — or a curious user — wrote by hand. None of that is worth a
 * blank page, so a bad read degrades to an empty list and a bad write is
 * swallowed, leaving the feature working in memory for the rest of the session.
 *
 * Only slug lists are stored: short arrays of package slugs. No personal data.
 */

export const WISHLIST_KEY = 'zurii_wishlist';
export const RECENTLY_VIEWED_KEY = 'zurii_recently_viewed';
export const RECENTLY_VIEWED_LIMIT = 8;

const isSlug = (value) => typeof value === 'string' && value.length > 0;

/** Strings only, de-duplicated, first occurrence wins so order is preserved. */
const clean = (list) => (Array.isArray(list) ? [...new Set(list.filter(isSlug))] : []);

/**
 * Read a slug list. Returns `[]` for a missing key, invalid JSON, a value that
 * is not an array, or an array of the wrong thing. Never throws.
 */
export function readSlugList(key) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    return clean(JSON.parse(raw));
  } catch {
    return [];
  }
}

/** Persist a slug list. Never throws — a blocked or full store is not an error. */
export function writeSlugList(key, list) {
  try {
    window.localStorage.setItem(key, JSON.stringify(clean(list)));
  } catch {
    // Storage unavailable or over quota: keep going without persistence.
  }
}

/**
 * A subscribable view of one slug list, used by `useWishlist` and
 * `useRecentlyViewed` through `useSyncExternalStore`.
 *
 * Two things make this more than a getter/setter pair:
 *
 * 1. `getSnapshot` must return the *same* array reference until the value
 *    actually changes, otherwise React re-renders forever. So the parsed list
 *    is cached and only replaced on a write.
 * 2. Every mounted consumer has to learn about a change made by any other one,
 *    hence the subscriber set rather than per-component state.
 *
 * The `storage` event keeps a second tab in sync. Its listener is attached with
 * the first subscriber and removed with the last, so importing this module has
 * no side effects.
 */
export function createSlugListStore(key) {
  const subscribers = new Set();
  let snapshot = null; // null = not read from storage yet

  const load = () => {
    snapshot = readSlugList(key);
  };

  const emit = () => {
    for (const notify of subscribers) notify();
  };

  const onStorage = (event) => {
    // `key === null` is `localStorage.clear()`, which affects us too.
    if (event.key !== null && event.key !== key) return;
    load();
    emit();
  };

  return {
    subscribe(notify) {
      subscribers.add(notify);
      if (subscribers.size === 1) window.addEventListener('storage', onStorage);
      return () => {
        subscribers.delete(notify);
        if (subscribers.size === 0) window.removeEventListener('storage', onStorage);
      };
    },

    getSnapshot() {
      if (snapshot === null) load();
      return snapshot;
    },

    /** Persist `next`, cache it, then wake every consumer. */
    set(next) {
      const value = clean(next);
      writeSlugList(key, value);
      snapshot = value;
      emit();
    },
  };
}

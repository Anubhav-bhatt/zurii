import { useSyncExternalStore } from 'react';

import { RECENTLY_VIEWED_KEY, RECENTLY_VIEWED_LIMIT, createSlugListStore } from '../utils/storage';

/**
 * The trips this browser looked at, most recent first, capped at
 * `RECENTLY_VIEWED_LIMIT`.
 *
 * Reading is a hook; recording is not. `recordPackageView` is a plain function
 * so a page can call it from an effect once the package has loaded without
 * dragging in a second hook — and because it writes to the same shared store,
 * any mounted `<RecentlyViewed />` updates immediately.
 */

const store = createSlugListStore(RECENTLY_VIEWED_KEY);

export function useRecentlyViewed() {
  const slugs = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return { slugs };
}

/**
 * Move `slug` to the front of the list. Re-viewing the trip that is already
 * first is a no-op: it writes nothing and notifies nobody, so calling this from
 * an effect that reruns cannot loop.
 */
export function recordPackageView(slug) {
  if (!slug) return;

  const current = store.getSnapshot();
  if (current[0] === slug) return;

  store.set([slug, ...current.filter((s) => s !== slug)].slice(0, RECENTLY_VIEWED_LIMIT));
}

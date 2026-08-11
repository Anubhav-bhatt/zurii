import { useCallback, useMemo, useSyncExternalStore } from 'react';

import { WISHLIST_KEY, createSlugListStore } from '../utils/storage';
import { track } from '../services/analytics';

/**
 * Saved trips, persisted in `localStorage`.
 *
 * One module-level store is shared by every consumer, so the heart on a card,
 * the heart on the trip page and the counter in the header all show the same
 * thing the instant any one of them is used — and a change in another tab
 * arrives through the `storage` event. That is what `useSyncExternalStore` buys
 * us over component state: no context provider to thread through the app, and
 * no stale copy per component.
 *
 * Usage:
 *   const { has, toggle, count } = useWishlist();
 */

const store = createSlugListStore(WISHLIST_KEY);

export function useWishlist() {
  const slugs = useSyncExternalStore(store.subscribe, store.getSnapshot);

  // Membership is checked once per card in long grids, so pay for the Set once
  // per snapshot instead of scanning the array each time.
  const saved = useMemo(() => new Set(slugs), [slugs]);
  const has = useCallback((slug) => saved.has(slug), [saved]);

  // The mutators read the live snapshot rather than `slugs`, so two calls in
  // the same tick (or a call from a stale closure) cannot drop a write.
  // The mutators are also the analytics choke point: every heart on every
  // card goes through here, so add/remove is recorded exactly once per action.
  const toggle = useCallback((slug) => {
    if (!slug) return;
    const current = store.getSnapshot();
    const removing = current.includes(slug);
    store.set(removing ? current.filter((s) => s !== slug) : [slug, ...current]);
    track(removing ? 'wishlist_remove' : 'wishlist_add', { entityType: 'package', entitySlug: slug });
  }, []);

  const remove = useCallback((slug) => {
    const current = store.getSnapshot();
    if (!slug || !current.includes(slug)) return;
    store.set(current.filter((s) => s !== slug));
    track('wishlist_remove', { entityType: 'package', entitySlug: slug });
  }, []);

  const clear = useCallback(() => {
    if (store.getSnapshot().length === 0) return;
    store.set([]);
  }, []);

  return { slugs, count: slugs.length, has, toggle, remove, clear };
}

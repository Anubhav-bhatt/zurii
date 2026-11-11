/**
 * Recovery from failed route-chunk loads (ZT-05).
 *
 * Every page except the home page is a lazy chunk with a content-hashed name.
 * After a deployment the previous build's chunks are gone, so a visitor still
 * running the old index.html gets a failed import when they navigate. Loading
 * the new index.html fixes that — once. The guard below allows one automatic
 * reload per RELOAD_GUARD_MS, so a chunk that is genuinely missing (or a
 * network that keeps failing) ends at the error screen instead of a reload
 * loop. Pure functions: no React, no direct window access, so they can be
 * unit-tested in Node.
 */

const CHUNK_ERROR_PATTERNS = [
  /Failed to fetch dynamically imported module/i, // Chromium
  /error loading dynamically imported module/i, // Firefox
  /Importing a module script failed/i, // Safari
  /Unable to preload CSS/i, // Vite's preload helper
  /Loading (CSS )?chunk [\w-]+ failed/i,
  /is not a valid JavaScript MIME type/i, // an HTML page served for a missing chunk
];

/** True for errors that mean "the code for this page could not be fetched". */
export function isChunkLoadError(error) {
  if (!error) return false;
  if (error.name === 'ChunkLoadError') return true;
  const message = String(error.message ?? error);
  return CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

export const RELOAD_GUARD_KEY = 'zurii_chunk_reload_at';
export const RELOAD_GUARD_MS = 30_000;

/**
 * Claim the one automatic reload. Returns true (and records the time) when no
 * reload happened in the last RELOAD_GUARD_MS; false otherwise, or when
 * storage is unavailable — without it a loop could not be prevented.
 */
export function claimAutoReload(storage, now = Date.now()) {
  try {
    if (!storage) return false;
    const last = Number(storage.getItem(RELOAD_GUARD_KEY) || 0);
    if (last && now - last < RELOAD_GUARD_MS) return false;
    storage.setItem(RELOAD_GUARD_KEY, String(now));
    return true;
  } catch {
    return false;
  }
}

/**
 * Wrap a dynamic import so a chunk that is missing after a deployment triggers
 * one guarded reload. Offline failures and repeat failures are re-thrown for
 * the route error boundary, which offers a manual retry instead.
 *
 * @param {() => Promise<unknown>} importer
 * @param {{ storage: Storage | null, reload: () => void, isOnline: () => boolean }} env
 */
export function withChunkRecovery(importer, { storage, reload, isOnline }) {
  return () =>
    importer().catch((error) => {
      if (isChunkLoadError(error) && isOnline() && claimAutoReload(storage)) {
        reload();
        // Keep the loading state up until the reload replaces the page.
        return new Promise(() => {});
      }
      throw error;
    });
}

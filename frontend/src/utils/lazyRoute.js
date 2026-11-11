import { lazy } from 'react';

import { withChunkRecovery } from './chunkRecovery';

function sessionStore() {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * React.lazy for route pages, with one guarded reload when the chunk is gone
 * after a deployment (see utils/chunkRecovery.js). Offline failures are not
 * reloaded — the browser would replace the site with its own offline page — and
 * reach the route error boundary instead, which offers a manual retry.
 */
export function lazyRoute(importer) {
  return lazy(
    withChunkRecovery(importer, {
      storage: sessionStore(),
      reload: () => window.location.reload(),
      isOnline: () => typeof navigator === 'undefined' || navigator.onLine !== false,
    })
  );
}

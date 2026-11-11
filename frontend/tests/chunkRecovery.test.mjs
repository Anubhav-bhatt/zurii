// ZT-05: deploy-time chunk failures reload once, never in a loop.
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  RELOAD_GUARD_KEY,
  RELOAD_GUARD_MS,
  claimAutoReload,
  isChunkLoadError,
  withChunkRecovery,
} from '../src/utils/chunkRecovery.js';

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
}

const settles = (promise, ms = 30) =>
  Promise.race([promise.then(() => true, () => true), new Promise((r) => setTimeout(() => r(false), ms))]);

describe('isChunkLoadError', () => {
  it('recognises the browsers\' failed dynamic import messages', () => {
    for (const message of [
      'Failed to fetch dynamically imported module: https://x/assets/Page-abc.js',
      'error loading dynamically imported module',
      'Importing a module script failed.',
      'Unable to preload CSS for /assets/Page-abc.css',
      "'text/html' is not a valid JavaScript MIME type.",
    ]) {
      assert.equal(isChunkLoadError(new TypeError(message)), true, message);
    }
    assert.equal(isChunkLoadError({ name: 'ChunkLoadError', message: '' }), true);
  });

  it('does not treat ordinary bugs as chunk failures', () => {
    assert.equal(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'map')")), false);
    assert.equal(isChunkLoadError(null), false);
  });
});

describe('claimAutoReload', () => {
  it('allows one reload per guard window', () => {
    const storage = memoryStorage();
    assert.equal(claimAutoReload(storage, 1_000_000), true);
    assert.equal(claimAutoReload(storage, 1_000_000 + RELOAD_GUARD_MS - 1), false);
    assert.equal(claimAutoReload(storage, 1_000_000 + RELOAD_GUARD_MS), true);
  });

  it('refuses when storage is missing or throws, since a loop could not be prevented', () => {
    assert.equal(claimAutoReload(null), false);
    const throwing = { getItem: () => { throw new Error('blocked'); }, setItem: () => {} };
    assert.equal(claimAutoReload(throwing), false);
  });
});

describe('withChunkRecovery', () => {
  const chunkError = () => new TypeError('Failed to fetch dynamically imported module: /assets/Page-old.js');

  it('passes a successful import straight through', async () => {
    let reloads = 0;
    const load = withChunkRecovery(async () => ({ default: 'Page' }), {
      storage: memoryStorage(), reload: () => { reloads += 1; }, isOnline: () => true,
    });
    assert.deepEqual(await load(), { default: 'Page' });
    assert.equal(reloads, 0);
  });

  it('reloads once for a missing chunk and keeps the loading state', async () => {
    let reloads = 0;
    const storage = memoryStorage();
    const load = withChunkRecovery(async () => { throw chunkError(); }, {
      storage, reload: () => { reloads += 1; }, isOnline: () => true,
    });
    assert.equal(await settles(load()), false, 'the import must stay pending while the page reloads');
    assert.equal(reloads, 1);
    assert.ok(storage.getItem(RELOAD_GUARD_KEY));
  });

  it('shows the error instead of reloading again (no loop)', async () => {
    let reloads = 0;
    const storage = memoryStorage();
    storage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
    const load = withChunkRecovery(async () => { throw chunkError(); }, {
      storage, reload: () => { reloads += 1; }, isOnline: () => true,
    });
    await assert.rejects(load(), /dynamically imported module/);
    assert.equal(reloads, 0);
  });

  it('does not reload while offline', async () => {
    let reloads = 0;
    const load = withChunkRecovery(async () => { throw chunkError(); }, {
      storage: memoryStorage(), reload: () => { reloads += 1; }, isOnline: () => false,
    });
    await assert.rejects(load());
    assert.equal(reloads, 0);
  });

  it('re-throws ordinary errors for the error boundary', async () => {
    let reloads = 0;
    const load = withChunkRecovery(async () => { throw new Error('boom'); }, {
      storage: memoryStorage(), reload: () => { reloads += 1; }, isOnline: () => true,
    });
    await assert.rejects(load(), /boom/);
    assert.equal(reloads, 0);
  });
});

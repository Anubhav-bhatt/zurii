/**
 * Scroll positions per history entry, for Back/Forward restoration (ZT-24).
 *
 * React Router gives every history entry a `key` that survives a reload (it is
 * stored in history.state), so positions are kept per key in sessionStorage.
 * Pure helpers — the component lives in components/ScrollToTop.jsx.
 */
const KEY = 'zurii_scroll_positions';
const LIMIT = 50;

function session() {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

export function createScrollMemory(storage = session(), limit = LIMIT) {
  let positions = new Map();
  try {
    positions = new Map(JSON.parse(storage?.getItem(KEY) ?? '[]'));
  } catch {
    positions = new Map();
  }
  const persist = () => {
    try {
      storage?.setItem(KEY, JSON.stringify([...positions]));
    } catch {
      // storage blocked: positions still work for this page's lifetime
    }
  };
  return {
    get: (key) => positions.get(key),
    set(key, y) {
      positions.delete(key);
      positions.set(key, Math.max(0, Math.round(y)));
      while (positions.size > limit) positions.delete(positions.keys().next().value);
      persist();
    },
    size: () => positions.size,
  };
}

/**
 * Move to `y` at once. index.css sets `scroll-behavior: smooth` for in-page
 * anchors, and a plain scrollTo() obeys it: a trip opened from halfway down the
 * list would visibly glide up from the old offset. Browsers that reject
 * 'instant' fall back to the plain call.
 */
export function jumpTo(y, win = globalThis.window) {
  try {
    win.scrollTo({ top: y, left: 0, behavior: 'instant' });
  } catch {
    win.scrollTo(0, y);
  }
}

/**
 * Scroll to `y` once the page is tall enough. A restored list page usually
 * renders before its data arrives, so the position is retried every frame
 * until it is reached or `timeoutMs` passes. Any scroll input from the visitor
 * cancels it. Returns a cancel function.
 */
export function restoreScroll(y, env = {}) {
  const {
    win = globalThis.window,
    raf = (fn) => win.requestAnimationFrame(fn),
    caf = (id) => win.cancelAnimationFrame(id),
    now = () => Date.now(),
    timeoutMs = 3000,
  } = env;
  if (!win) return () => {};
  const deadline = now() + timeoutMs;
  let frame = 0;
  let done = false;
  const stop = () => {
    if (done) return;
    done = true;
    caf(frame);
    for (const type of ['wheel', 'touchstart', 'keydown', 'mousedown']) win.removeEventListener?.(type, stop);
  };
  for (const type of ['wheel', 'touchstart', 'keydown', 'mousedown']) win.addEventListener?.(type, stop, { passive: true, once: true });
  const attempt = () => {
    if (done) return;
    jumpTo(y, win);
    if (Math.abs(win.scrollY - y) <= 2 || now() >= deadline) {
      stop();
      return;
    }
    frame = raf(attempt);
  };
  attempt();
  return stop;
}

/**
 * A tiny concurrency gate for expensive work (ZT-08).
 *
 * Sign-in runs one bcrypt-12 comparison per attempt (~0.2 s of CPU on libuv's
 * four-thread pool, which pg's DNS lookups and fs share). The per-client
 * limiters in middleware/security.js bound what one network can spend, but a
 * flood spread over many networks could still queue unbounded bcrypt work and
 * slow every other request. The gate runs at most `concurrency` tasks at once,
 * lets up to `maxQueue` wait, and refuses the rest immediately with
 * WorkGateBusyError, which the login route answers with 503 + Retry-After.
 *
 * In-process and in-memory, like the limiters: no Redis, per replica.
 */
class WorkGateBusyError extends Error {
  constructor() {
    super('Work gate is full.');
    this.name = 'WorkGateBusyError';
  }
}

function createWorkGate({ concurrency, maxQueue }) {
  let active = 0;
  const waiting = [];

  const release = () => {
    const next = waiting.shift();
    // Hand the slot straight to the next waiter; only free it when none wait.
    if (next) next();
    else active -= 1;
  };

  return {
    async run(task) {
      if (active < concurrency) {
        active += 1;
      } else {
        if (waiting.length >= maxQueue) throw new WorkGateBusyError();
        await new Promise((resolve) => waiting.push(resolve));
      }
      try {
        return await task();
      } finally {
        release();
      }
    },
    stats: () => ({ active, queued: waiting.length }),
  };
}

/**
 * The sign-in gate: two comparisons at a time (a Render starter instance has
 * half a CPU, so more would only queue inside libuv instead of here), and up to
 * 16 waiting — about 1.6 s of work at ~0.2 s each, well inside any client
 * timeout. Normal admin traffic never waits.
 */
const LOGIN_WORK_GATE = Object.freeze({ concurrency: 2, maxQueue: 16 });

module.exports = { createWorkGate, WorkGateBusyError, LOGIN_WORK_GATE };

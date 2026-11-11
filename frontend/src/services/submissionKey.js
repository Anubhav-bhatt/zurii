/**
 * Idempotency keys for the public lead forms (Phase 4).
 *
 * One key per submission ATTEMPT: pressing Send again with the same contents —
 * after a double click, a timeout, or an error that left it unclear whether the
 * enquiry arrived — reuses the key, so the server returns the enquiry it already
 * saved instead of storing a second one. Changing the contents, or a successful
 * send, starts a new key: a genuinely new enquiry is never suppressed.
 */

/** RFC 4122 v4 UUID. randomUUID needs a secure context; getRandomValues does not. */
export function newIdempotencyKey(cryptoImpl = globalThis.crypto) {
  if (typeof cryptoImpl?.randomUUID === 'function') return cryptoImpl.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof cryptoImpl?.getRandomValues === 'function') cryptoImpl.getRandomValues(bytes);
  else for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Stable text for the payload, so the same contents map to the same key. */
const fingerprint = (payload) =>
  JSON.stringify(Object.keys(payload ?? {}).sort().map((k) => [k, payload[k] ?? null]));

/**
 * Tracks the key for one form. `keyFor(payload)` returns the current key while
 * the contents are unchanged; `succeeded()` clears it after a confirmed send.
 */
export function createSubmissionKeys(makeKey = newIdempotencyKey) {
  let current = null;
  return {
    keyFor(payload) {
      const print = fingerprint(payload);
      if (!current || current.print !== print) current = { key: makeKey(), print };
      return current.key;
    },
    succeeded() {
      current = null;
    },
  };
}

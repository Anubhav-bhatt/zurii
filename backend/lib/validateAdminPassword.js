/**
 * Admin password policy. Pure and dependency-free so it can be unit-tested and
 * shared by the CLI and any future admin-managed password change.
 *
 * The policy is length-first on purpose. Character-class rules ("one uppercase,
 * one digit, one symbol") reliably produce `Password1!` — memorable to a human
 * and near the top of every cracking wordlist — while blocking genuinely strong
 * passphrases. Length plus a small block-list of the passwords attackers
 * actually try is a better trade for a handful of admin accounts.
 */

/** Below this, online guessing is realistic even against a rate limit. */
const MIN_LENGTH = 20;

/**
 * The ONLY relaxation of the policy above, and it is deliberately narrow.
 *
 * An operator provisioning a new admin has to transmit that first password to a
 * human being — read down a phone line, typed from a note, carried across a room
 * — and a 20-character passphrase survives none of that intact. So a temporary
 * credential may be shorter.
 *
 * What makes this safe is not the number. It is that a password validated at
 * this length can only ever be written by a code path that sets
 * `must_change_password = TRUE` in the same statement (create-admin.js
 * `add-temporary` / `reset-temporary`). Such an account authenticates, and then
 * middleware/auth.js refuses it every route except reading its own session and
 * replacing the password. It cannot reach one row of business data.
 *
 * The replacement it is forced into runs `validateAdminPassword` — the full
 * 20-character policy. So the short password is never the account's password
 * for longer than one sign-in, and there is no path by which a permanent
 * password reaches this shorter bar.
 *
 * Every OTHER rule below — the block-list, the 72-byte cap, the whitespace and
 * username checks, the distinct-character floor — applies identically to both.
 * The two policies differ by exactly this one integer, which is why they share
 * one implementation rather than being copied apart and left to drift.
 */
const BOOTSTRAP_MIN_LENGTH = 10;

/**
 * bcrypt hashes at most 72 BYTES and silently ignores everything after — so a
 * longer password is not more secure, and worse, two different passwords
 * sharing their first 72 bytes would both unlock the account. Rejecting past
 * that is honest about what the hash can actually carry. Measured in bytes, not
 * characters: one emoji is four bytes.
 */
const MAX_BYTES = 72;

/**
 * Deliberately short: the passwords that actually appear in credential-stuffing
 * lists aimed at a site like this one. A giant dictionary belongs in a library,
 * not in a V1 policy, and length is doing most of the work here.
 */
const WEAK_PASSWORDS = [
  'admin',
  'administrator',
  'password',
  'password123',
  'admin123',
  'zurii',
  'zurii123',
  'zuriitravels',
  'letmein',
  'welcome',
  'changeme',
  'changemeplease',
  'qwerty',
  '12345678',
  'iloveyou',
];

/**
 * The shared implementation. `minLength` is the single knob the two exported
 * policies differ by; everything else is identical for both by construction.
 *
 * @param {string} password
 * @param {string} username compared case-insensitively when supplied
 * @param {number} minLength
 * @returns {{ valid: boolean, error: string|null }} `error` is safe to print —
 *   it never contains the submitted password.
 */
function check(password, username, minLength) {
  if (typeof password !== 'string' || password.length === 0) {
    return { valid: false, error: 'A password is required.' };
  }

  if (password.length < minLength) {
    return {
      valid: false,
      error: `Admin password must be at least ${minLength} characters and must not be a common/default password.`,
    };
  }

  if (Buffer.byteLength(password, 'utf8') > MAX_BYTES) {
    return {
      valid: false,
      error: `Admin password must be at most ${MAX_BYTES} bytes — bcrypt ignores anything beyond that.`,
    };
  }

  // Leading/trailing whitespace is almost always a copy-paste artefact, and it
  // is invisible when the password is later typed by hand.
  if (password !== password.trim()) {
    return { valid: false, error: 'Admin password must not start or end with whitespace.' };
  }

  const lowered = password.toLowerCase();

  if (username && lowered === String(username).toLowerCase()) {
    return { valid: false, error: 'Admin password must not be the same as the username.' };
  }

  // Separators are stripped before matching as well as after, because padding a
  // weak word with punctuation is the most common way to satisfy a length rule
  // without gaining any strength: "CHANGE_ME_please" (the placeholder this repo
  // used to ship), "admin.123.admin", "p-a-s-s-w-o-r-d". Normalising to letters
  // and digits catches all of them with one comparison.
  const normalized = lowered.replace(/[^a-z0-9]/g, '');

  // `contains`, not `equals`: the length minimum means a weak password is
  // usually padded ("admin123admin123") rather than used bare, and that is no
  // stronger than the weak seed it repeats.
  const matched = WEAK_PASSWORDS.find((weak) => lowered.includes(weak) || normalized.includes(weak));
  if (matched) {
    // Name the term that matched.
    //
    // This used to return the same sentence as the length failure — "must be at
    // least N characters and must not be a common/default password" — which is
    // unusable feedback for the case it most often fires on: a long passphrase
    // that happens to contain the brand name. Someone typing a 30-character
    // password reads "must be at least 20 characters", concludes the rule is
    // broken, and tries variations of the same rejected word.
    //
    // Echoing `matched` is safe and is not echoing the password: it is one of
    // the fifteen fixed strings in WEAK_PASSWORDS above, never arbitrary input,
    // and the block-list is public in this file. What must never appear is the
    // submitted password itself, which is why the surrounding text is fixed and
    // only the matched term is interpolated.
    return {
      valid: false,
      error: `Admin password must not contain "${matched}" — it is a common or brand-related term attackers try first. Choose unrelated words.`,
    };
  }

  // A single repeated character or a repeated short unit passes a length check
  // while carrying almost no entropy ("aaaaaaaaaaaaaaaa", "abcabcabcabcabcabc").
  if (new Set(password).size < 6) {
    return {
      valid: false,
      error: 'Admin password repeats too few distinct characters — use a longer passphrase.',
    };
  }

  return { valid: true, error: null };
}

/**
 * The policy for every password an admin chooses for themselves: the forced
 * first-login replacement, and every rotation after it. This is the one the
 * change-password endpoint uses, and the only one that can produce a password
 * an account keeps.
 */
function validateAdminPassword(password, username = '') {
  return check(password, username, MIN_LENGTH);
}

/**
 * The policy for an operator-issued TEMPORARY password — see the long note on
 * BOOTSTRAP_MIN_LENGTH above before calling this.
 *
 * Callers must set `must_change_password = TRUE` in the same write. There are
 * exactly two: the `add-temporary` and `reset-temporary` commands in
 * create-admin.js, both of which do. Nothing on the HTTP surface calls it.
 */
function validateBootstrapPassword(password, username = '') {
  return check(password, username, BOOTSTRAP_MIN_LENGTH);
}

module.exports = {
  validateAdminPassword,
  validateBootstrapPassword,
  MIN_LENGTH,
  BOOTSTRAP_MIN_LENGTH,
  MAX_BYTES,
};

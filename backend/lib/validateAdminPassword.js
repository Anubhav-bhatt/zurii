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
const MIN_LENGTH = 16;

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
 * @param {string} password
 * @param {string} [username] compared case-insensitively when supplied
 * @returns {{ valid: boolean, error: string|null }} `error` is safe to print —
 *   it never contains the submitted password.
 */
function validateAdminPassword(password, username = '') {
  if (typeof password !== 'string' || password.length === 0) {
    return { valid: false, error: 'A password is required.' };
  }

  if (password.length < MIN_LENGTH) {
    return {
      valid: false,
      error: `Admin password must be at least ${MIN_LENGTH} characters and must not be a common/default password.`,
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

  // `contains`, not `equals`: the 16-character minimum means a weak password is
  // usually padded ("admin123admin123") rather than used bare, and that is no
  // stronger than the weak seed it repeats.
  const matched = WEAK_PASSWORDS.find((weak) => lowered.includes(weak) || normalized.includes(weak));
  if (matched) {
    return {
      valid: false,
      error: `Admin password must be at least ${MIN_LENGTH} characters and must not be a common/default password.`,
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

module.exports = { validateAdminPassword, MIN_LENGTH, MAX_BYTES };

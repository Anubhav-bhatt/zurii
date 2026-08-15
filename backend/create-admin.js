/**
 * Zurii Travels — Admin Account Management Script
 *
 * Usage:
 *   node create-admin.js add <username> [password]     — Create a new admin
 *   node create-admin.js add-temporary <username>      — Same, short bootstrap password
 *   node create-admin.js remove <username>             — Remove an admin
 *   node create-admin.js disable <username>            — Revoke access, keep the account
 *   node create-admin.js enable <username>             — Restore a disabled account
 *   node create-admin.js list                          — List all admin usernames
 *   node create-admin.js change-password <username>    — Change a password (prompted)
 *   node create-admin.js reset-password <username>     — Issue a temporary password
 *   node create-admin.js reset-temporary <username>    — Same, short bootstrap password
 *   node create-admin.js reset <username> [password]    — Alias of change-password
 *
 * Two security properties this script is responsible for:
 *
 *   1. Password policy. Every password written here goes through
 *      lib/validateAdminPassword.js first, so the length minimum and the
 *      common-defaults block-list apply to creation and rotation alike.
 *
 *      The two `-temporary` commands are the single exception, and a narrow
 *      one: they validate against the shorter bootstrap minimum, and they are
 *      also the only commands that ALWAYS set must_change_password. The
 *      account they produce can reach nothing but the password screen, and the
 *      replacement it is forced into meets the full policy. See the note on
 *      BOOTSTRAP_MIN_LENGTH in lib/validateAdminPassword.js.
 *
 *   2. Passwords should not be typed as command-line arguments. An argv password
 *      lands in shell history and is visible to every other process on the box
 *      via `ps`. Omit it and this script prompts with terminal echo disabled;
 *      the argument form is kept only for existing scripted use.
 *
 * Nothing here ever prints a password or a bcrypt hash.
 */

require('dotenv').config();
const bcrypt = require('bcrypt');
const readline = require('readline');
const { Pool } = require('pg');

const {
  validateAdminPassword,
  validateBootstrapPassword,
  MIN_LENGTH,
  BOOTSTRAP_MIN_LENGTH,
} = require('./lib/validateAdminPassword');
const { AUDIT_EVENTS, recordAuditEvent } = require('./lib/adminAudit');

const config = require('pg-connection-string').parse(process.env.DATABASE_URL);
if (config.host !== 'localhost' && config.host !== '127.0.0.1') {
  config.ssl = { rejectUnauthorized: false };
}
const pool = new Pool(config);

const [, , action, username, passwordArg] = process.argv;

/**
 * One readline interface, reused for every prompt.
 *
 * It must be shared, not created per prompt: with piped stdin the first
 * interface consumes the entire buffer, so a second interface never receives a
 * line and its promise never settles — the process then exits silently with the
 * account uncreated. Creating it lazily keeps `list`/`remove` from opening stdin
 * at all.
 */
let sharedRl = null;

function getReadline() {
  if (!sharedRl) {
    sharedRl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: Boolean(process.stdin.isTTY),
    });
  }
  return sharedRl;
}

function closeReadline() {
  if (sharedRl) {
    sharedRl.close();
    sharedRl = null;
  }
}

/**
 * Lines from piped stdin, read once and handed out in order.
 *
 * readline is deliberately NOT used for the piped case. With `terminal: false`
 * it consumes the stream eagerly and reaches EOF before a second `question()`
 * can register a listener, so the second prompt never resolves: the process
 * exits silently having created nothing. Draining stdin once and shifting lines
 * off an array makes multi-prompt input deterministic.
 */
let pipedLines = null;

async function readPipedLines() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8').split(/\r?\n/);
}

/**
 * Read a password without echoing it.
 *
 * On a TTY the muted `_writeToOutput` suppresses the per-character echo readline
 * would otherwise print, so the password never appears on screen or in a shared
 * terminal recording. It is restored afterwards so later prompts still render.
 * With piped stdin (CI, `printf ... |`) echo is not a concern.
 */
async function promptHidden(question) {
  if (!process.stdin.isTTY) {
    if (pipedLines === null) pipedLines = await readPipedLines();
    return (pipedLines.shift() ?? '').trim();
  }

  return new Promise((resolve) => {
    const rl = getReadline();
    process.stdout.write(question);
    const restore = rl._writeToOutput; // eslint-disable-line no-underscore-dangle
    rl._writeToOutput = () => {}; // eslint-disable-line no-underscore-dangle
    rl.question('', (answer) => {
      rl._writeToOutput = restore; // eslint-disable-line no-underscore-dangle
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

/**
 * Three ways to supply a password, in order of preference:
 *
 *   1. ADMIN_PASSWORD in the environment. Recommended, because the shell's own
 *      `read -rs` is a battle-tested hidden read and an env var never enters
 *      shell history the way a command argument does:
 *        read -rs ADMIN_PASSWORD && export ADMIN_PASSWORD
 *        node create-admin.js add alice
 *        unset ADMIN_PASSWORD
 *   2. The interactive prompt below (no echo), when stdin is a terminal.
 *   3. An argv argument — kept for existing scripts, warned against, because it
 *      lands in shell history and is visible to every process via `ps`.
 */
/**
 * @param {string} targetUsername
 * @param {object} [options]
 * @param {boolean} [options.temporary] validate against the shorter bootstrap
 *   policy instead of the full one. ONLY the `add-temporary` and
 *   `reset-temporary` cases pass this, and both write
 *   `must_change_password = TRUE` in the same statement — which is the entire
 *   justification for the shorter minimum. See lib/validateAdminPassword.js.
 */
async function resolvePassword(targetUsername, options = {}) {
  const temporary = options.temporary === true;
  const validate = temporary ? validateBootstrapPassword : validateAdminPassword;
  const minimum = temporary ? BOOTSTRAP_MIN_LENGTH : MIN_LENGTH;

  const fromEnv = process.env.ADMIN_PASSWORD;
  if (fromEnv) {
    const check = validate(fromEnv, targetUsername);
    if (!check.valid) {
      console.error(`✗ ${check.error}`);
      return null;
    }
    console.log('  (using ADMIN_PASSWORD from the environment — run `unset ADMIN_PASSWORD` when done)');
    return fromEnv;
  }

  if (passwordArg) {
    console.warn('⚠ Passing a password as an argument leaves it in shell history and `ps`.');
    console.warn('  Prefer: node create-admin.js change-password <username>');
    const check = validate(passwordArg, targetUsername);
    if (!check.valid) {
      console.error(`✗ ${check.error}`);
      return null;
    }
    return passwordArg;
  }

  const first = await promptHidden(`New password (min ${minimum} chars, not echoed): `);
  const check = validate(first, targetUsername);
  if (!check.valid) {
    console.error(`✗ ${check.error}`);
    return null;
  }

  const second = await promptHidden('Confirm password: ');
  if (first !== second) {
    console.error('✗ Passwords did not match.');
    return null;
  }
  return first;
}

async function run() {
  try {
    // Ensure admins table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // Present on a migrated database; added here too so this utility works on a
    // fresh one without requiring the migration to have run first.
    await pool.query('ALTER TABLE admins ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0');
    await pool.query('ALTER TABLE admins ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0');
    await pool.query('ALTER TABLE admins ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ');
    await pool.query('ALTER TABLE admins ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE');
    await pool.query('ALTER TABLE admins ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ');
    await pool.query('ALTER TABLE admins ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE');

    switch (action) {
      // `add` and `add-temporary` differ by exactly one thing: which policy the
      // operator's password has to satisfy. Both create the account with
      // must_change_password = TRUE, so both produce a credential that reaches
      // nothing but the password screen — which is what licenses the shorter
      // minimum on the second one.
      case 'add':
      case 'add-temporary': {
        if (!username) {
          console.error(`Usage: node create-admin.js ${action} <username> [password]`);
          process.exit(1);
        }
        // Matched case-insensitively because login normalises the same way, so
        // "jordan" and "Jordan" are the same account to the login endpoint. A
        // case-sensitive check here would let this command create a second row
        // that the UNIQUE constraint permits but nobody can reliably sign in to
        // — LOWER(username) would then match two rows and the login query would
        // pick whichever Postgres returned first.
        const exists = await pool.query('SELECT id FROM admins WHERE LOWER(username) = LOWER($1)', [username]);
        if (exists.rows.length > 0) {
          console.error(`Admin "${username}" already exists.`);
          console.error('  To issue a fresh temporary password for it instead:');
          console.error(`  node create-admin.js reset-temporary ${username}`);
          process.exit(1);
        }
        const password = await resolvePassword(username, { temporary: action === 'add-temporary' });
        if (!password) process.exit(1);

        const hash = await bcrypt.hash(password, 12);
        // must_change_password = TRUE: whatever the operator typed here is a
        // TEMPORARY credential. The account can sign in but reaches nothing
        // except the password screen until the person replaces it, after which
        // the operator no longer knows their password.
        const created = await pool.query(
          `INSERT INTO admins (username, password_hash, must_change_password, active)
           VALUES ($1, $2, TRUE, TRUE) RETURNING id`,
          [username, hash]
        );
        await recordAuditEvent(pool, {
          adminId: created.rows[0].id,
          eventType: AUDIT_EVENTS.ADMIN_CREATED,
          success: true,
          metadata: { username, source: 'cli', mustChangePassword: true },
        });
        console.log(`✓ Admin "${username}" created successfully.`);
        console.log('  First-login password change required.');
        console.log('  Share the temporary password once, through a password manager or another');
        console.log('  private channel — never email, chat or a ticket.');
        break;
      }

      case 'remove': {
        if (!username) {
          console.error('Usage: node create-admin.js remove <username>');
          process.exit(1);
        }
        const result = await pool.query('DELETE FROM admins WHERE username = $1 RETURNING id', [username]);
        if (result.rows.length === 0) {
          console.error(`Admin "${username}" not found.`);
          process.exit(1);
        }
        // admin_id is ON DELETE SET NULL, so this row survives the account with
        // the username preserved in metadata.
        await recordAuditEvent(pool, {
          eventType: AUDIT_EVENTS.ADMIN_REMOVED,
          success: true,
          metadata: { username, source: 'cli' },
        });
        console.log(`✓ Admin "${username}" removed. All of their sessions are now invalid.`);
        break;
      }

      case 'list': {
        const admins = await pool.query(
          `SELECT id, username, created_at, token_version, failed_login_attempts, locked_until,
                  must_change_password, active
             FROM admins ORDER BY id`
        );
        if (admins.rows.length === 0) {
          console.log('No admin accounts found.');
        } else {
          console.log('\nAdmin Accounts:');
          console.log('─'.repeat(72));
          admins.rows.forEach((a) => {
            const locked = a.locked_until && new Date(a.locked_until) > new Date()
              ? ` LOCKED until ${new Date(a.locked_until).toLocaleTimeString()}`
              : '';
            const pending = a.must_change_password ? ' — TEMPORARY PASSWORD, change pending' : '';
            const disabled = a.active === false ? ' — DISABLED' : '';
            console.log(
              `  ${a.id}. ${a.username}  (created: ${new Date(a.created_at).toLocaleDateString()}` +
              `, sessions rev: ${a.token_version}, failed: ${a.failed_login_attempts}${locked})${disabled}${pending}`
            );
          });
          console.log(`\nTotal: ${admins.rows.length} admin(s)\n`);
        }
        break;
      }

      // Operator recovery: issue a NEW temporary password and force the admin
      // through first-login replacement again. This is what to run when someone
      // forgets their password or an account may be compromised — there is
      // deliberately no self-service email/SMS reset in V1.
      //
      // `reset-temporary` is the same operation validated against the shorter
      // bootstrap policy — for the case this exists to serve: handing a
      // credential to a person over a channel a 20-character passphrase does
      // not survive. Both set must_change_password = TRUE, so neither can
      // produce a password the account keeps.
      case 'reset-password':
      case 'reset-temporary': {
        if (!username) {
          console.error(`Usage: node create-admin.js ${action} <username>`);
          process.exit(1);
        }
        const target = await pool.query('SELECT id FROM admins WHERE LOWER(username) = LOWER($1)', [username]);
        if (target.rows.length === 0) {
          console.error(`Admin "${username}" not found.`);
          process.exit(1);
        }

        const password = await resolvePassword(username, { temporary: action === 'reset-temporary' });
        if (!password) process.exit(1);

        const hash = await bcrypt.hash(password, 12);
        const result = await pool.query(
          `UPDATE admins
              SET password_hash = $1,
                  must_change_password = TRUE,
                  password_changed_at = NOW(),
                  token_version = token_version + 1,
                  failed_login_attempts = 0,
                  locked_until = NULL
            WHERE LOWER(username) = LOWER($2)
            RETURNING id`,
          [hash, username]
        );
        await recordAuditEvent(pool, {
          adminId: result.rows[0].id,
          eventType: AUDIT_EVENTS.PASSWORD_RESET,
          success: true,
          metadata: { username, source: 'cli', mustChangePassword: true },
        });
        console.log(`✓ Temporary password issued for "${username}".`);
        console.log('  All of their existing sessions are now invalid.');
        console.log('  They must set a new private password at first login.');
        break;
      }

      // `reset` is kept as an alias of change-password so existing muscle memory
      // and any scripts keep working — its meaning is deliberately unchanged.
      // For the forced-replacement flow use `reset-password` above.
      case 'reset':
      case 'change-password': {
        if (!username) {
          console.error(`Usage: node create-admin.js ${action} <username> [password]`);
          process.exit(1);
        }
        const target = await pool.query('SELECT id FROM admins WHERE LOWER(username) = LOWER($1)', [username]);
        if (target.rows.length === 0) {
          console.error(`Admin "${username}" not found.`);
          process.exit(1);
        }

        const password = await resolvePassword(username);
        if (!password) process.exit(1);

        const hash = await bcrypt.hash(password, 12);
        // token_version is incremented in the same statement as the new hash, so
        // a changed password cannot leave old sessions alive even briefly — which
        // matters most in the case this exists for: a suspected compromise.
        //
        // must_change_password is cleared here because this command sets a FINAL
        // password, and the help text has always said so. It previously left the
        // flag untouched, so the documented sequence for provisioning an account
        // with a known-good password — `add` (which sets the flag TRUE), then
        // `change-password` — produced an admin who was still forced through the
        // first-login replacement screen and could reach nothing else. The
        // temporary-credential path is `reset-password`, which sets it TRUE.
        const result = await pool.query(
          `UPDATE admins
              SET password_hash = $1,
                  must_change_password = FALSE,
                  password_changed_at = NOW(),
                  token_version = token_version + 1,
                  failed_login_attempts = 0,
                  locked_until = NULL
            WHERE LOWER(username) = LOWER($2)
            RETURNING id, token_version`,
          [hash, username]
        );
        await recordAuditEvent(pool, {
          adminId: result.rows[0].id,
          eventType: AUDIT_EVENTS.PASSWORD_CHANGED,
          success: true,
          metadata: { username, source: 'cli', mustChangePassword: false },
        });
        console.log(`✓ Password changed for "${username}".`);
        console.log('  All existing sessions for this admin have been revoked; they must log in again.');
        console.log('  (This sets a FINAL password. To issue a temporary one the admin must replace,');
        console.log('   use: node create-admin.js reset-password ' + username + ')');
        break;
      }

      // Revoke access without deleting the row. Deleting an admin also severs
      // the audit trail's link to everything they did (admin_id is ON DELETE
      // SET NULL), which is the opposite of what you want when someone leaves
      // under a cloud. The version bump ends their live sessions immediately;
      // the `active` flag stops them signing in again.
      case 'disable':
      case 'enable': {
        if (!username) {
          console.error(`Usage: node create-admin.js ${action} <username>`);
          process.exit(1);
        }
        const enabling = action === 'enable';
        const result = await pool.query(
          `UPDATE admins
              SET active = $1,
                  token_version = token_version + 1,
                  failed_login_attempts = 0,
                  locked_until = NULL
            WHERE LOWER(username) = LOWER($2)
            RETURNING id, username`,
          [enabling, username]
        );
        if (result.rows.length === 0) {
          console.error(`Admin "${username}" not found.`);
          process.exit(1);
        }
        const row = result.rows[0];
        await recordAuditEvent(pool, {
          adminId: row.id,
          eventType: enabling ? AUDIT_EVENTS.ADMIN_CREATED : AUDIT_EVENTS.ADMIN_REMOVED,
          success: true,
          metadata: { username: row.username, source: 'cli' },
        });
        if (enabling) {
          console.log(`✓ Admin "${row.username}" re-enabled. They must log in again.`);
          console.log('  Their old password still works — rotate it if the account was disabled');
          console.log(`  because the credential may have leaked: node create-admin.js reset-temporary ${row.username}`);
        } else {
          console.log(`✓ Admin "${row.username}" disabled. Every session is revoked and`);
          console.log('  they can no longer sign in. The account and its audit history are kept.');
        }
        break;
      }

      default:
        console.log('Zurii Admin Management');
        console.log('─'.repeat(56));
        console.log('  node create-admin.js add <username>              — new admin, temporary password');
        console.log('  node create-admin.js add-temporary <username>    — same, short bootstrap password');
        console.log('  node create-admin.js reset-password <username>   — new temporary password (recovery)');
        console.log('  node create-admin.js reset-temporary <username>  — same, short bootstrap password');
        console.log('  node create-admin.js change-password <username>  — set a final password directly');
        console.log('  node create-admin.js disable <username>          — revoke access, keep the account');
        console.log('  node create-admin.js enable <username>           — restore a disabled account');
        console.log('  node create-admin.js remove <username>           — delete, revoking all sessions');
        console.log('  node create-admin.js list');
        console.log('  node create-admin.js reset <username> [password] — alias of change-password');
        console.log('');
        console.log(`Passwords: minimum ${MIN_LENGTH} characters, no common defaults.`);
        console.log('');
        console.log(`The two -temporary commands accept ${BOOTSTRAP_MIN_LENGTH}+ characters instead, for a credential`);
        console.log('you have to read to someone. They ALWAYS set must_change_password, so the');
        console.log(`account can reach nothing but the password screen, and the replacement it is`);
        console.log(`forced into still has to meet the full ${MIN_LENGTH}-character policy.`);
        console.log('');
        console.log('Omit the password argument to be prompted without echo (recommended).');
    }
  } catch (err) {
    console.error('Error:', err.message);
    process.exitCode = 1;
  } finally {
    closeReadline();
    await pool.end();
  }
}

run();

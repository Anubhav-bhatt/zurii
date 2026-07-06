/**
 * Zurii Travels — Admin Account Management Script
 * 
 * Usage:
 *   node create-admin.js add <username> <password>     — Create a new admin
 *   node create-admin.js remove <username>              — Remove an admin
 *   node create-admin.js list                           — List all admin usernames
 *   node create-admin.js reset <username> <newpassword> — Reset an admin's password
 */

require('dotenv').config();
const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const config = require('pg-connection-string').parse(process.env.DATABASE_URL);
if (config.host !== 'localhost' && config.host !== '127.0.0.1') {
  config.ssl = { rejectUnauthorized: false };
}
const pool = new Pool(config);

const [,, action, username, password] = process.argv;

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

    switch (action) {
      case 'add': {
        if (!username || !password) {
          console.error('Usage: node create-admin.js add <username> <password>');
          process.exit(1);
        }
        const exists = await pool.query('SELECT id FROM admins WHERE username = $1', [username]);
        if (exists.rows.length > 0) {
          console.error(`Admin "${username}" already exists.`);
          process.exit(1);
        }
        const hash = await bcrypt.hash(password, 12);
        await pool.query('INSERT INTO admins (username, password_hash) VALUES ($1, $2)', [username, hash]);
        console.log(`✓ Admin "${username}" created successfully.`);
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
        console.log(`✓ Admin "${username}" removed.`);
        break;
      }

      case 'list': {
        const admins = await pool.query('SELECT id, username, created_at FROM admins ORDER BY id');
        if (admins.rows.length === 0) {
          console.log('No admin accounts found.');
        } else {
          console.log('\nAdmin Accounts:');
          console.log('─'.repeat(50));
          admins.rows.forEach(a => {
            console.log(`  ${a.id}. ${a.username}  (created: ${new Date(a.created_at).toLocaleDateString()})`);
          });
          console.log(`\nTotal: ${admins.rows.length} admin(s)\n`);
        }
        break;
      }

      case 'reset': {
        if (!username || !password) {
          console.error('Usage: node create-admin.js reset <username> <newpassword>');
          process.exit(1);
        }
        const hash = await bcrypt.hash(password, 12);
        const result = await pool.query(
          'UPDATE admins SET password_hash = $1 WHERE username = $2 RETURNING id',
          [hash, username]
        );
        if (result.rows.length === 0) {
          console.error(`Admin "${username}" not found.`);
          process.exit(1);
        }
        console.log(`✓ Password reset for "${username}".`);
        break;
      }

      default:
        console.log('Zurii Admin Management');
        console.log('─'.repeat(40));
        console.log('  node create-admin.js add <username> <password>');
        console.log('  node create-admin.js remove <username>');
        console.log('  node create-admin.js list');
        console.log('  node create-admin.js reset <username> <newpassword>');
    }
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

run();

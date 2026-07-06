require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const { requireAuth } = require('./middleware/auth');

const app = express();
const port = process.env.PORT || 5001;

// JWT Configuration
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const ACCESS_TOKEN_EXPIRY = '15m';   // 15 minutes
const REFRESH_TOKEN_EXPIRY = '7d';   // 7 days

if (!JWT_SECRET || !JWT_REFRESH_SECRET) {
  console.error('ERROR: JWT_SECRET and JWT_REFRESH_SECRET must be set in .env');
  process.exit(1);
}

// Middleware
app.use(cors({
  origin: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// Database
if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is not set. Please create a .env file in the backend/ directory with your PostgreSQL connection string.');
  process.exit(1);
}
const config = require('pg-connection-string').parse(process.env.DATABASE_URL);
if (config.host !== 'localhost' && config.host !== '127.0.0.1') {
  config.ssl = { rejectUnauthorized: false };
}
const pool = new Pool(config);

// ══════════════════════════════════════════
// DATABASE INITIALIZATION
// ══════════════════════════════════════════

const initDB = async () => {
  try {
    // Contacts table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS contacts (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(50) NOT NULL,
        interest VARCHAR(255),
        message TEXT,
        callback VARCHAR(50),
        priority VARCHAR(20) DEFAULT 'normal',
        status VARCHAR(30) DEFAULT 'pending',
        source VARCHAR(50) DEFAULT 'Website',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'normal'`);
    await pool.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'pending'`);
    await pool.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'Website'`);
    console.log("✓ Contacts table ready.");

    // Admins table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("✓ Admins table ready.");

    // Seed initial admin users (skip if they already exist)
    const adminUsers = [
      { username: 'Yashjain28', password: 'Yash*123' },
      { username: 'aayat10',    password: 'aayat101' },
      { username: 'arshiya01',  password: 'arshiya010' },
    ];

    for (const admin of adminUsers) {
      const exists = await pool.query('SELECT id FROM admins WHERE username = $1', [admin.username]);
      if (exists.rows.length === 0) {
        const hash = await bcrypt.hash(admin.password, 12);
        await pool.query(
          'INSERT INTO admins (username, password_hash) VALUES ($1, $2)',
          [admin.username, hash]
        );
        console.log(`  → Seeded admin: ${admin.username}`);
      }
    }

    console.log("✓ Admin accounts ready.");
  } catch (err) {
    console.error("DB Initialization Error:", err);
  }
};
initDB();

// ══════════════════════════════════════════
// HELPER: Generate Tokens
// ══════════════════════════════════════════

const generateAccessToken = (admin) => {
  return jwt.sign(
    { id: admin.id, username: admin.username },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
};

const generateRefreshToken = (admin) => {
  return jwt.sign(
    { id: admin.id, username: admin.username },
    JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );
};

// ══════════════════════════════════════════
// AUTH ROUTES (Public)
// ══════════════════════════════════════════

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Username and password are required.' 
      });
    }

    // Find admin by username
    const result = await pool.query(
      'SELECT * FROM admins WHERE username = $1',
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid username or password.' 
      });
    }

    const admin = result.rows[0];

    // Compare password with bcrypt hash
    const passwordMatch = await bcrypt.compare(password, admin.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid username or password.' 
      });
    }

    // Generate tokens
    const accessToken = generateAccessToken(admin);
    const refreshToken = generateRefreshToken(admin);

    // Set refresh token as HttpOnly cookie
    res.cookie('zurii_refresh_token', refreshToken, {
      httpOnly: true,       // Not accessible via JavaScript
      secure: process.env.NODE_ENV === 'production',  // HTTPS only in production
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,  // 7 days in ms
      path: '/',
    });

    res.status(200).json({
      success: true,
      accessToken,
      admin: {
        id: admin.id,
        username: admin.username,
      },
    });
  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).json({ success: false, error: 'Login failed. Server error.' });
  }
});

// POST /api/auth/refresh
app.post('/api/auth/refresh', async (req, res) => {
  try {
    const refreshToken = req.cookies?.zurii_refresh_token;

    if (!refreshToken) {
      return res.status(401).json({ 
        success: false, 
        error: 'No refresh token. Please log in again.' 
      });
    }

    // Verify the refresh token
    const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);

    // Confirm admin still exists in DB
    const result = await pool.query('SELECT id, username FROM admins WHERE id = $1', [decoded.id]);
    if (result.rows.length === 0) {
      return res.status(401).json({ 
        success: false, 
        error: 'Admin account no longer exists.' 
      });
    }

    const admin = result.rows[0];

    // Issue new access token
    const accessToken = generateAccessToken(admin);

    res.status(200).json({
      success: true,
      accessToken,
      admin: {
        id: admin.id,
        username: admin.username,
      },
    });
  } catch (err) {
    // If refresh token is expired or invalid, clear the cookie
    res.clearCookie('zurii_refresh_token', { path: '/' });
    return res.status(401).json({ 
      success: false, 
      error: 'Session expired. Please log in again.' 
    });
  }
});

// POST /api/auth/logout
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('zurii_refresh_token', { path: '/' });
  res.status(200).json({ success: true, message: 'Logged out successfully.' });
});

// ══════════════════════════════════════════
// PUBLIC ROUTES (No auth required)
// ══════════════════════════════════════════

// POST /api/contact — Visitors submit contact/inquiry forms
app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, phone, interest, message, callback, priority, status, source } = req.body;
    const query = `
      INSERT INTO contacts (name, email, phone, interest, message, callback, priority, status, source)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *;
    `;
    const values = [
      name, 
      email, 
      phone, 
      interest, 
      message, 
      callback, 
      priority || 'normal', 
      status || 'pending', 
      source || 'Website'
    ];
    const result = await pool.query(query, values);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("Insert Error:", err);
    res.status(500).json({ success: false, error: 'Database insertion failed' });
  }
});

// ══════════════════════════════════════════
// PROTECTED ROUTES (Auth required)
// ══════════════════════════════════════════

// GET /api/contact — Fetch all leads (Admin only)
app.get('/api/contact', requireAuth, async (req, res) => {
  try {
    const { status } = req.query;
    let queryStr = 'SELECT * FROM contacts';
    const values = [];
    
    if (status) {
      queryStr += ' WHERE status = $1';
      values.push(status);
    }
    
    queryStr += `
      ORDER BY 
        CASE WHEN priority = 'high' THEN 0 ELSE 1 END,
        created_at DESC
    `;
    
    const result = await pool.query(queryStr, values);
    res.status(200).json({ success: true, data: result.rows });
  } catch (err) {
    console.error("Fetch Error:", err);
    res.status(500).json({ success: false, error: 'Failed to fetch contacts' });
  }
});

// PATCH /api/contact/:id/complete — Mark lead as completed (Admin only)
app.patch('/api/contact/:id/complete', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const query = `
      UPDATE contacts 
      SET status = 'completed' 
      WHERE id = $1 
      RETURNING *;
    `;
    const result = await pool.query(query, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Contact not found' });
    }
    res.status(200).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("Complete Error:", err);
    res.status(500).json({ success: false, error: 'Failed to complete contact' });
  }
});

// PATCH /api/contact/:id/reopen — Reopen a completed lead (Admin only)
app.patch('/api/contact/:id/reopen', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const query = `
      UPDATE contacts 
      SET status = 'pending' 
      WHERE id = $1 
      RETURNING *;
    `;
    const result = await pool.query(query, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Contact not found' });
    }
    res.status(200).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("Reopen Error:", err);
    res.status(500).json({ success: false, error: 'Failed to reopen contact' });
  }
});

// DELETE /api/contact/:id — Delete a lead (Admin only)
app.delete('/api/contact/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const query = `
      DELETE FROM contacts 
      WHERE id = $1 
      RETURNING *;
    `;
    const result = await pool.query(query, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Contact not found' });
    }
    res.status(200).json({ success: true, message: 'Lead deleted successfully', data: result.rows[0] });
  } catch (err) {
    console.error("Delete Error:", err);
    res.status(500).json({ success: false, error: 'Failed to delete contact' });
  }
});

// ══════════════════════════════════════════
// START SERVER
// ══════════════════════════════════════════

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

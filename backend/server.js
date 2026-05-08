require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 5001;

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    // Allow server-to-server requests and same-origin calls with no Origin header.
    if (!origin) return callback(null, true);
    if (allowedOrigins.length === 0) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is not set. Please create a .env file in the backend/ directory with your PostgreSQL connection string.');
  console.error('Example: DATABASE_URL=postgres://user:password@localhost:5432/zurii_db');
  process.exit(1);
}
const config = require('pg-connection-string').parse(process.env.DATABASE_URL);
config.ssl = { rejectUnauthorized: false };
const pool = new Pool(config);

// Initialize DB schema
const initDB = async () => {
  try {
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // Add priority column if table already existed without it
    await pool.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'normal'`);
    console.log("Contacts table ready.");
  } catch (err) {
    console.error("DB Initialization Error:", err);
  }
};
initDB();

app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, phone, interest, message, callback, priority } = req.body || {};
    const cleanName = String(name || '').trim();
    const cleanEmail = String(email || '').trim();
    const cleanPhone = String(phone || '').trim();

    if (!cleanName || !cleanEmail || !cleanPhone) {
      return res.status(400).json({
        success: false,
        error: 'name, email, and phone are required',
      });
    }

    const query = `
      INSERT INTO contacts (name, email, phone, interest, message, callback, priority)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;
    `;
    const values = [
      cleanName,
      cleanEmail,
      cleanPhone,
      interest || null,
      message || null,
      callback || null,
      priority || 'normal',
    ];
    const result = await pool.query(query, values);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("Insert Error:", err);
    res.status(500).json({ success: false, error: 'Database insertion failed' });
  }
});

app.get('/api/contact', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM contacts 
      ORDER BY 
        CASE WHEN priority = 'high' THEN 0 ELSE 1 END,
        created_at DESC
    `);
    res.status(200).json({ success: true, data: result.rows });
  } catch (err) {
    console.error("Fetch Error:", err);
    res.status(500).json({ success: false, error: 'Failed to fetch contacts' });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 5001;

app.use(cors({
  origin: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  credentials: true,
}));
app.use(express.json());

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
    const { name, email, phone, interest, message, callback, priority } = req.body;
    const query = `
      INSERT INTO contacts (name, email, phone, interest, message, callback, priority)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;
    `;
    const values = [name, email, phone, interest, message, callback, priority || 'normal'];
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

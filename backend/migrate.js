require('dotenv').config();
const { Pool } = require('pg');

const LOCAL_DB_URL = process.env.LOCAL_DB_URL || "postgresql://postgres@localhost:5432/postgres";
const AIVEN_DB_URL = process.env.DATABASE_URL;

async function runMigration() {
  console.log("Starting DB migration from local to cloud...");
  
  const localPool = new Pool({ connectionString: LOCAL_DB_URL });
  const aivenPool = new Pool({ connectionString: AIVEN_DB_URL, ssl: { rejectUnauthorized: false } });
  
  try {
    // 1. Check if local contacts table exists
    const tableCheck = await localPool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'contacts'
      );
    `);
    
    if (!tableCheck.rows[0].exists) {
      console.log("Local 'contacts' table does not exist. Nothing to migrate.");
      return;
    }
    
    const localContacts = await localPool.query("SELECT * FROM contacts");
    console.log(`Found ${localContacts.rows.length} contacts locally.`);
    
    if (localContacts.rows.length === 0) {
      console.log("No data found locally. Migration completed.");
      return;
    }

    // 2. Ensure contacts table exists on target Aiven DB
    await aivenPool.query(`
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
    await aivenPool.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'normal'`);

    // 3. Insert each local contact into Aiven (handling conflicts on id)
    for (const c of localContacts.rows) {
      const insertQuery = `
        INSERT INTO contacts (id, name, email, phone, interest, message, callback, priority, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          email = EXCLUDED.email,
          phone = EXCLUDED.phone,
          interest = EXCLUDED.interest,
          message = EXCLUDED.message,
          callback = EXCLUDED.callback,
          priority = EXCLUDED.priority,
          created_at = EXCLUDED.created_at;
      `;
      const values = [c.id, c.name, c.email, c.phone, c.interest, c.message, c.callback, c.priority, c.created_at];
      await aivenPool.query(insertQuery, values);
    }
    
    console.log("Migration finished successfully! All local contacts synced to Aiven.");
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    await localPool.end();
    await aivenPool.end();
  }
}

runMigration();

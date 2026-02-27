const { Pool } = require('pg');
require('dotenv').config();

// Usually, the default username and database name are both 'postgres'
const pool = new Pool({
  user: process.env.PG_USER || 'postgres',
  host: process.env.PG_HOST || 'localhost',
  database: process.env.PG_DATABASE || 'postgres',
  password: process.env.PG_PASSWORD || 'root123',
  port: process.env.PG_PORT || 5432,
});

pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

// Initialize the database table if it doesn't exist
const initDB = async () => {
  const queryText = `
    CREATE TABLE IF NOT EXISTS alerts (
      id SERIAL PRIMARY KEY,
      type VARCHAR(255) NOT NULL,
      zone VARCHAR(255),
      density INTEGER,
      metadata JSONB,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  try {
    await pool.query(queryText);
    console.log('✅ PostgreSQL "alerts" table is ready.');
  } catch (err) {
    console.error('❌ Error initializing database:', err);
  }
};

module.exports = {
  query: (text, params) => pool.query(text, params),
  initDB,
};

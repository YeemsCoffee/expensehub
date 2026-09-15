const { Pool } = require('pg');
require('dotenv').config();

// Pool tuning applies to both connection styles.  Previously these were only
// set for the local-dev branch, so production ran with pg defaults
// (max 10, wait-forever connection timeout).
const tuning = {
  max: Number(process.env.DB_POOL_MAX) || 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  statement_timeout: Number(process.env.DB_STATEMENT_TIMEOUT_MS) || 30000
};

// Support both DATABASE_URL (for Render/Heroku) and individual params (for local dev)
const poolConfig = process.env.DATABASE_URL
  ? {
      ...tuning,
      connectionString: process.env.DATABASE_URL,
      // Set DB_SSL_REJECT_UNAUTHORIZED=true once the host's CA is trusted.
      ssl: {
        rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true'
      }
    }
  : {
      ...tuning,
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'expensehub',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD
    };

const pool = new Pool(poolConfig);

// Log the first successful connection only (the pool opens many).
let announced = false;
pool.on('connect', () => {
  if (!announced) {
    announced = true;
    console.log('✅ Connected to PostgreSQL database');
  }
});

pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle client', err);
  // Don't crash the server - let it try to reconnect
  // Only log the error and let the connection pool handle recovery
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};

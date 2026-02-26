const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'expensehub',
  password: process.env.DB_PASSWORD || 'postgres',
  port: process.env.DB_PORT || 5432,
});

async function applyMigration() {
  try {
    console.log('Applying WBS elements migration...');

    const migrationSQL = fs.readFileSync(
      path.join(__dirname, 'database', 'add_wbs_elements.sql'),
      'utf8'
    );

    await pool.query(migrationSQL);

    console.log('✓ WBS elements migration applied successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

applyMigration();

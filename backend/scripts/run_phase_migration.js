const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Load database configuration from environment
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'expensehub',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres'
});

async function runMigration() {
  const client = await pool.connect();

  try {
    console.log('Starting migration: Adding default phases to old projects...');

    // Read the SQL migration file
    const sqlFilePath = path.join(__dirname, '../database/add_default_phases_to_old_projects.sql');
    const sql = fs.readFileSync(sqlFilePath, 'utf8');

    // Execute the migration
    await client.query(sql);

    console.log('✓ Migration completed successfully!');
    console.log('\nProject phases have been added to all existing projects.');

  } catch (error) {
    console.error('✗ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the migration
runMigration();

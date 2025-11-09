const fs = require('fs');
const path = require('path');
const db = require('../config/database');

/**
 * Run database migrations on startup
 * This ensures all required tables exist before the app starts
 */
async function runMigrations() {
  console.log('\n🔧 Checking database migrations...');

  try {
    // Test database connection first with timeout
    const testConnection = await Promise.race([
      db.query('SELECT 1'),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Database connection timeout')), 5000)
      )
    ]);

    // Check if Xero tables exist
    const checkTables = await db.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_name IN ('xero_connections', 'xero_account_mappings')
      AND table_schema = 'public'
    `);

    if (checkTables.rows.length === 2) {
      console.log('✅ Xero tables already exist - skipping migration');
      return;
    }

    console.log('📝 Applying Xero migration...');

    // Read and execute migration file
    const migrationPath = path.join(__dirname, '../database/receipt_xero_migration.sql');

    if (!fs.existsSync(migrationPath)) {
      console.warn('⚠️  Migration file not found, skipping...');
      return;
    }

    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    // Execute migration with timeout
    await Promise.race([
      db.query(migrationSQL),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Migration timeout')), 10000)
      )
    ]);

    console.log('✅ Xero migration applied successfully!');

    // Verify tables were created
    const verifyTables = await db.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_name IN ('xero_connections', 'xero_account_mappings')
      AND table_schema = 'public'
    `);

    console.log(`✅ Created ${verifyTables.rows.length} Xero tables`);

  } catch (error) {
    // Don't crash the app if migration fails
    // (tables might already exist, database unavailable, or timeout)
    console.error('⚠️  Migration error (non-fatal):', error.message);
    console.log('⏩ Server will continue starting without migration');
  }
}

module.exports = { runMigrations };

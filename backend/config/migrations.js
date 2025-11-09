const fs = require('fs');
const path = require('path');
const db = require('../config/database');

/**
 * Run database migrations on startup
 * This ensures all required tables exist before the app starts
 */
async function runMigrations() {
  console.log('\n🔧 [MIGRATION] Checking database migrations...');

  try {
    // Test database connection first with timeout
    console.log('[MIGRATION] Testing database connection...');
    const testConnection = await Promise.race([
      db.query('SELECT 1'),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Database connection timeout')), 5000)
      )
    ]);
    console.log('[MIGRATION] Database connection successful');

    // Check if Xero tables exist
    console.log('[MIGRATION] Checking if Xero tables exist...');
    const checkTables = await db.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_name IN ('xero_connections', 'xero_account_mappings')
      AND table_schema = 'public'
    `);

    console.log(`[MIGRATION] Found ${checkTables.rows.length} Xero tables`);

    if (checkTables.rows.length === 2) {
      console.log('✅ [MIGRATION] Xero tables already exist - skipping migration');
      return;
    }

    console.log('📝 [MIGRATION] Applying Xero migration...');

    // Read and execute migration file
    const migrationPath = path.join(__dirname, '../database/receipt_xero_migration.sql');
    console.log(`[MIGRATION] Migration path: ${migrationPath}`);

    if (!fs.existsSync(migrationPath)) {
      console.warn('⚠️  [MIGRATION] Migration file not found, skipping...');
      console.warn(`[MIGRATION] Looked in: ${migrationPath}`);
      return;
    }

    console.log('[MIGRATION] Reading migration file...');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    console.log(`[MIGRATION] Migration file size: ${migrationSQL.length} bytes`);

    // Execute migration with timeout
    console.log('[MIGRATION] Executing migration SQL...');
    await Promise.race([
      db.query(migrationSQL),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Migration timeout')), 10000)
      )
    ]);

    console.log('✅ [MIGRATION] Xero migration applied successfully!');

    // Verify tables were created
    const verifyTables = await db.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_name IN ('xero_connections', 'xero_account_mappings')
      AND table_schema = 'public'
    `);

    console.log(`✅ [MIGRATION] Created ${verifyTables.rows.length} Xero tables`);

  } catch (error) {
    // Don't crash the app if migration fails
    // (tables might already exist, database unavailable, or timeout)
    console.error('⚠️  [MIGRATION] Migration error (non-fatal):', error.message);
    console.error('[MIGRATION] Full error:', error);
    console.log('⏩ [MIGRATION] Server will continue starting without migration');
  }
}

module.exports = { runMigrations };

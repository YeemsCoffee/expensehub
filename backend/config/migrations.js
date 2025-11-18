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

    // 1. Check and apply Xero migration
    console.log('[MIGRATION] Checking if Xero tables exist...');
    const checkXeroTables = await db.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_name IN ('xero_connections', 'xero_account_mappings')
      AND table_schema = 'public'
    `);

    console.log(`[MIGRATION] Found ${checkXeroTables.rows.length} Xero tables`);

    if (checkXeroTables.rows.length < 2) {
      console.log('📝 [MIGRATION] Applying Xero migration...');

      const xeroMigrationPath = path.join(__dirname, '../database/receipt_xero_migration.sql');
      console.log(`[MIGRATION] Xero migration path: ${xeroMigrationPath}`);

      if (fs.existsSync(xeroMigrationPath)) {
        console.log('[MIGRATION] Reading Xero migration file...');
        const xeroMigrationSQL = fs.readFileSync(xeroMigrationPath, 'utf8');
        console.log(`[MIGRATION] Xero migration file size: ${xeroMigrationSQL.length} bytes`);

        console.log('[MIGRATION] Executing Xero migration SQL...');
        await Promise.race([
          db.query(xeroMigrationSQL),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Migration timeout')), 10000)
          )
        ]);

        console.log('✅ [MIGRATION] Xero migration applied successfully!');
      } else {
        console.warn('⚠️  [MIGRATION] Xero migration file not found, skipping...');
      }
    } else {
      console.log('✅ [MIGRATION] Xero tables already exist - skipping Xero migration');
    }

    // 2. Check and apply Amazon Order Tracking migration
    console.log('[MIGRATION] Checking if Amazon order tracking columns exist...');
    const checkAmazonColumns = await db.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'cart_items'
      AND column_name = 'amazon_spaid'
      AND table_schema = 'public'
    `);

    console.log(`[MIGRATION] Amazon SPAID column exists: ${checkAmazonColumns.rows.length > 0}`);

    if (checkAmazonColumns.rows.length === 0) {
      console.log('📝 [MIGRATION] Applying Amazon order tracking migration...');

      const amazonMigrationPath = path.join(__dirname, '../database/amazon_order_tracking_migration.sql');
      console.log(`[MIGRATION] Amazon migration path: ${amazonMigrationPath}`);

      if (fs.existsSync(amazonMigrationPath)) {
        console.log('[MIGRATION] Reading Amazon migration file...');
        const amazonMigrationSQL = fs.readFileSync(amazonMigrationPath, 'utf8');
        console.log(`[MIGRATION] Amazon migration file size: ${amazonMigrationSQL.length} bytes`);

        console.log('[MIGRATION] Executing Amazon migration SQL...');
        await Promise.race([
          db.query(amazonMigrationSQL),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Migration timeout')), 10000)
          )
        ]);

        console.log('✅ [MIGRATION] Amazon order tracking migration applied successfully!');
      } else {
        console.warn('⚠️  [MIGRATION] Amazon migration file not found, skipping...');
      }
    } else {
      console.log('✅ [MIGRATION] Amazon order tracking columns already exist - skipping Amazon migration');
    }

    // 3. Check and apply Seed Data migration
    console.log('[MIGRATION] Checking if seed data is needed...');
    const checkData = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM cost_centers WHERE is_active = true) as cc_count,
        (SELECT COUNT(*) FROM locations WHERE is_active = true) as loc_count
    `);

    const ccCount = parseInt(checkData.rows[0].cc_count);
    const locCount = parseInt(checkData.rows[0].loc_count);

    console.log(`[MIGRATION] Found ${ccCount} cost centers and ${locCount} locations`);

    if (ccCount === 0 || locCount === 0) {
      console.log('📝 [MIGRATION] Applying seed data migration...');

      const seedMigrationPath = path.join(__dirname, '../database/seed_data_migration.sql');
      console.log(`[MIGRATION] Seed migration path: ${seedMigrationPath}`);

      if (fs.existsSync(seedMigrationPath)) {
        console.log('[MIGRATION] Reading seed migration file...');
        const seedMigrationSQL = fs.readFileSync(seedMigrationPath, 'utf8');
        console.log(`[MIGRATION] Seed migration file size: ${seedMigrationSQL.length} bytes`);

        console.log('[MIGRATION] Executing seed migration SQL...');
        await Promise.race([
          db.query(seedMigrationSQL),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Migration timeout')), 10000)
          )
        ]);

        console.log('✅ [MIGRATION] Seed data migration applied successfully!');
      } else {
        console.warn('⚠️  [MIGRATION] Seed migration file not found, skipping...');
      }
    } else {
      console.log('✅ [MIGRATION] Seed data already exists - skipping seed migration');
    }

  } catch (error) {
    // Don't crash the app if migration fails
    // (tables might already exist, database unavailable, or timeout)
    console.error('⚠️  [MIGRATION] Migration error (non-fatal):', error.message);
    console.error('[MIGRATION] Full error:', error);
    console.log('⏩ [MIGRATION] Server will continue starting without migration');
  }
}

module.exports = { runMigrations };

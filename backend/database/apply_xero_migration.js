#!/usr/bin/env node

/**
 * Apply Xero migration to database
 * Run this on Render or locally to set up Xero tables
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function applyMigration() {
  console.log('\n🔧 Xero Database Migration\n');
  console.log('='.repeat(60));

  // Create database connection
  const poolConfig = process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: {
          rejectUnauthorized: false
        }
      }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        database: process.env.DB_NAME || 'expensehub',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD,
      };

  const pool = new Pool(poolConfig);

  try {
    // Test connection
    await pool.query('SELECT NOW()');
    console.log('✅ Connected to database');

    // Check if Xero tables already exist
    const checkTables = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_name IN ('xero_connections', 'xero_account_mappings')
      AND table_schema = 'public'
    `);

    if (checkTables.rows.length === 2) {
      console.log('✅ Xero tables already exist');
      console.log('   - xero_connections');
      console.log('   - xero_account_mappings');

      // Check if expense columns exist
      const checkColumns = await pool.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'expenses'
        AND column_name IN ('xero_invoice_id', 'xero_synced_at', 'line_items')
      `);

      console.log(`✅ Found ${checkColumns.rows.length}/3 Xero columns in expenses table`);

      if (checkColumns.rows.length === 3) {
        console.log('\n✨ Xero integration is fully set up!\n');
        process.exit(0);
      }
    }

    console.log('\n📝 Applying Xero migration...\n');

    // Read and execute migration file
    const migrationPath = path.join(__dirname, 'receipt_xero_migration.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    // Execute migration
    await pool.query(migrationSQL);

    console.log('✅ Migration applied successfully!\n');

    // Verify tables were created
    const verifyTables = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_name IN ('xero_connections', 'xero_account_mappings')
      AND table_schema = 'public'
    `);

    console.log('📊 Created tables:');
    verifyTables.rows.forEach(row => {
      console.log(`   ✓ ${row.table_name}`);
    });

    // Verify expense columns
    const verifyColumns = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'expenses'
      AND column_name IN ('xero_invoice_id', 'xero_synced_at', 'line_items', 'veryfi_id', 'veryfi_url')
    `);

    console.log('\n📊 Added columns to expenses table:');
    verifyColumns.rows.forEach(row => {
      console.log(`   ✓ ${row.column_name}`);
    });

    console.log('\n✨ Xero integration setup complete!\n');
    console.log('Next steps:');
    console.log('  1. Ensure XERO_* environment variables are set');
    console.log('  2. Restart your application');
    console.log('  3. Connect to Xero from the Settings page\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('\nError details:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run migration
applyMigration();

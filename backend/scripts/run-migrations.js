#!/usr/bin/env node
/**
 * Database Migration Runner
 *
 * Runs all SQL migrations in the database/ folder
 * Usage: node scripts/run-migrations.js [migration-name.sql]
 *
 * If no migration name is provided, shows list of available migrations
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const MIGRATIONS_DIR = path.join(__dirname, '../database');

async function runMigration(filename) {
  const filePath = path.join(MIGRATIONS_DIR, filename);

  if (!fs.existsSync(filePath)) {
    console.error(`❌ Migration file not found: ${filename}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(filePath, 'utf8');

  console.log(`\n🔄 Running migration: ${filename}`);
  console.log('━'.repeat(50));

  try {
    await pool.query(sql);
    console.log(`✅ Migration completed: ${filename}`);
    return true;
  } catch (error) {
    console.error(`❌ Migration failed: ${filename}`);
    console.error('Error:', error.message);
    if (error.detail) console.error('Detail:', error.detail);
    if (error.hint) console.error('Hint:', error.hint);
    return false;
  }
}

async function listMigrations() {
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  console.log('\n📋 Available Migrations:\n');
  files.forEach((file, idx) => {
    console.log(`  ${idx + 1}. ${file}`);
  });
  console.log('\nUsage: node scripts/run-migrations.js [migration-name.sql]');
  console.log('Example: node scripts/run-migrations.js add_wbs_elements.sql\n');
}

async function main() {
  const migrationName = process.argv[2];

  if (!migrationName) {
    await listMigrations();
    process.exit(0);
  }

  const success = await runMigration(migrationName);
  await pool.end();
  process.exit(success ? 0 : 1);
}

main().catch(err => {
  console.error('Unexpected error:', err);
  pool.end();
  process.exit(1);
});

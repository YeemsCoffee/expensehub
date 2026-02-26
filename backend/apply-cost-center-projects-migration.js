/**
 * Apply cost center to projects migration
 * Run this to add cost_center_id column to projects table
 */

const fs = require('fs');
const path = require('path');
const db = require('./config/database');

async function applyMigration() {
  try {
    console.log('🔧 Applying cost center to projects migration...\n');

    // Read the migration SQL file
    const migrationPath = path.join(__dirname, 'database', 'add_cost_center_to_projects.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('📝 Migration SQL:');
    console.log(migrationSQL);
    console.log('\n' + '='.repeat(80) + '\n');

    // Execute the migration
    await db.query(migrationSQL);

    console.log('✅ Migration applied successfully!');
    console.log('\nAdded column to projects table:');
    console.log('  - cost_center_id (INTEGER, references cost_centers)');
    console.log('\nCreated index:');
    console.log('  - idx_projects_cost_center_id');

    // Verify the column exists
    console.log('\n🔍 Verifying migration...');
    const result = await db.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'projects'
      AND column_name = 'cost_center_id'
    `);

    if (result.rows.length === 1) {
      console.log('✅ Column verified:');
      result.rows.forEach(row => {
        console.log(`  - ${row.column_name} (${row.data_type}, nullable: ${row.is_nullable})`);
      });
    } else {
      console.log('⚠️  Warning: Expected 1 column but found', result.rows.length);
    }

    console.log('\n✅ Migration complete! Project codes will now auto-generate as XXXXX-XXX format.');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

applyMigration();

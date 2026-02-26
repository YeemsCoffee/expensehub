/**
 * Apply project approval workflow migration
 * Run this to add missing columns to the projects table
 */

const fs = require('fs');
const path = require('path');
const db = require('./config/database');

async function applyMigration() {
  try {
    console.log('🔧 Applying project approval workflow migration...\n');

    // Read the migration SQL file
    const migrationPath = path.join(__dirname, 'database', 'add_project_approval_workflow.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('📝 Migration SQL:');
    console.log(migrationSQL);
    console.log('\n' + '='.repeat(80) + '\n');

    // Execute the migration
    await db.query(migrationSQL);

    console.log('✅ Migration applied successfully!');
    console.log('\nAdded columns to projects table:');
    console.log('  - submitted_by (INTEGER, references users)');
    console.log('  - approved_by (INTEGER, references users)');
    console.log('  - approved_at (TIMESTAMP)');
    console.log('  - rejection_reason (TEXT)');
    console.log('\nCreated indexes:');
    console.log('  - idx_projects_submitted_by');
    console.log('  - idx_projects_approved_by');

    // Verify the columns exist
    console.log('\n🔍 Verifying migration...');
    const result = await db.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'projects'
      AND column_name IN ('submitted_by', 'approved_by', 'approved_at', 'rejection_reason')
      ORDER BY column_name
    `);

    if (result.rows.length === 4) {
      console.log('✅ All columns verified:');
      result.rows.forEach(row => {
        console.log(`  - ${row.column_name} (${row.data_type}, nullable: ${row.is_nullable})`);
      });
    } else {
      console.log('⚠️  Warning: Expected 4 columns but found', result.rows.length);
    }

    console.log('\n✅ Migration complete! You can now use the projects functionality.');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

applyMigration();

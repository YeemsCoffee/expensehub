const db = require('./config/database');

async function checkTable() {
  try {
    const result = await db.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'punchout_sessions'
      ORDER BY ordinal_position
    `);

    if (result.rows.length === 0) {
      console.log('Table does not exist yet.');
    } else {
      console.log('Table structure:');
      result.rows.forEach(row => {
        console.log(`  - ${row.column_name}: ${row.data_type}`);
      });
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkTable();
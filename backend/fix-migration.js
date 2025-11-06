const db = require('./config/database');

async function fixMigration() {
  try {
    console.log('Updating punchout_sessions table structure...');

    // Add buyer_cookie column if it doesn't exist
    console.log('Adding buyer_cookie column...');
    try {
      await db.query(`
        ALTER TABLE punchout_sessions
        ADD COLUMN IF NOT EXISTS buyer_cookie VARCHAR(255) UNIQUE;
      `);
      console.log('✓ buyer_cookie column added');
    } catch (err) {
      console.log('ℹ buyer_cookie column already exists or error:', err.message);
    }

    // Add vendor_name column if it doesn't exist
    console.log('Adding vendor_name column...');
    try {
      await db.query(`
        ALTER TABLE punchout_sessions
        ADD COLUMN IF NOT EXISTS vendor_name VARCHAR(255) DEFAULT 'Amazon Business';
      `);
      console.log('✓ vendor_name column added');
    } catch (err) {
      console.log('ℹ vendor_name column already exists or error:', err.message);
    }

    // Add request_xml column if it doesn't exist
    console.log('Adding request_xml column...');
    try {
      await db.query(`
        ALTER TABLE punchout_sessions
        ADD COLUMN IF NOT EXISTS request_xml TEXT;
      `);
      console.log('✓ request_xml column added');
    } catch (err) {
      console.log('ℹ request_xml column already exists or error:', err.message);
    }

    // Add response_xml column if it doesn't exist
    console.log('Adding response_xml column...');
    try {
      await db.query(`
        ALTER TABLE punchout_sessions
        ADD COLUMN IF NOT EXISTS response_xml TEXT;
      `);
      console.log('✓ response_xml column added');
    } catch (err) {
      console.log('ℹ response_xml column already exists or error:', err.message);
    }

    // Create indexes
    console.log('Creating indexes...');
    try {
      await db.query('CREATE INDEX IF NOT EXISTS idx_punchout_sessions_user_id ON punchout_sessions(user_id);');
      console.log('✓ user_id index created');
    } catch (err) {
      console.log('ℹ user_id index error:', err.message);
    }

    try {
      await db.query('CREATE INDEX IF NOT EXISTS idx_punchout_sessions_buyer_cookie ON punchout_sessions(buyer_cookie) WHERE buyer_cookie IS NOT NULL;');
      console.log('✓ buyer_cookie index created');
    } catch (err) {
      console.log('ℹ buyer_cookie index error:', err.message);
    }

    try {
      await db.query('CREATE INDEX IF NOT EXISTS idx_punchout_sessions_status ON punchout_sessions(status);');
      console.log('✓ status index created');
    } catch (err) {
      console.log('ℹ status index error:', err.message);
    }

    // Add unique constraint for products SKU
    console.log('Adding products SKU constraint...');
    try {
      await db.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'products_sku_key'
          ) THEN
            ALTER TABLE products ADD CONSTRAINT products_sku_key UNIQUE (sku);
          END IF;
        END $$;
      `);
      console.log('✓ Products SKU constraint added');
    } catch (err) {
      console.log('ℹ Products SKU constraint error:', err.message);
    }

    // Add unique constraint for cart_items
    console.log('Adding cart_items constraint...');
    try {
      await db.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'cart_items_user_product_key'
          ) THEN
            ALTER TABLE cart_items ADD CONSTRAINT cart_items_user_product_key UNIQUE (user_id, product_id);
          END IF;
        END $$;
      `);
      console.log('✓ Cart items constraint added');
    } catch (err) {
      console.log('ℹ Cart items constraint error:', err.message);
    }

    // Insert Amazon Business vendor
    console.log('Adding Amazon Business vendor...');
    try {
      await db.query(`
        INSERT INTO vendors (name, category, is_active, contact_email)
        VALUES ('Amazon Business', 'General Supplies', true, 'ab-integration@amazon.com')
        ON CONFLICT DO NOTHING;
      `);
      console.log('✓ Amazon Business vendor added');
    } catch (err) {
      console.log('ℹ Amazon Business vendor error:', err.message);
    }

    // Check final structure
    const result = await db.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'punchout_sessions'
      ORDER BY ordinal_position
    `);

    console.log('\n✓ Migration completed! Final table structure:');
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type}`);
    });

    // Check if Amazon vendor exists
    const vendorResult = await db.query(
      "SELECT id, name FROM vendors WHERE name = 'Amazon Business'"
    );

    if (vendorResult.rows.length > 0) {
      console.log('\n✓ Amazon Business vendor exists (ID:', vendorResult.rows[0].id + ')');
    }

    process.exit(0);
  } catch (error) {
    console.error('\n✗ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

fixMigration();
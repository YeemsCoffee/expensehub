const fs = require('fs');
const path = require('path');
const db = require('./config/database');

async function runMigration() {
  try {
    console.log('Running Amazon Punchout migration...');

    // Step 1: Create punchout_sessions table
    console.log('Creating punchout_sessions table...');
    await db.query(`
      CREATE TABLE IF NOT EXISTS punchout_sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        cost_center_id INTEGER REFERENCES cost_centers(id) ON DELETE SET NULL,
        vendor_name VARCHAR(255) NOT NULL DEFAULT 'Amazon Business',
        status VARCHAR(50) NOT NULL DEFAULT 'initiated',
        buyer_cookie VARCHAR(255) UNIQUE NOT NULL,
        request_xml TEXT,
        response_xml TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✓ punchout_sessions table created');

    // Step 2: Create indexes
    console.log('Creating indexes...');
    await db.query('CREATE INDEX IF NOT EXISTS idx_punchout_sessions_user_id ON punchout_sessions(user_id);');
    await db.query('CREATE INDEX IF NOT EXISTS idx_punchout_sessions_buyer_cookie ON punchout_sessions(buyer_cookie);');
    await db.query('CREATE INDEX IF NOT EXISTS idx_punchout_sessions_status ON punchout_sessions(status);');
    console.log('✓ Indexes created');

    // Step 3: Add unique constraint for products SKU
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
      console.log('ℹ Products SKU constraint already exists or error:', err.message);
    }

    // Step 4: Add unique constraint for cart_items
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
      console.log('ℹ Cart items constraint already exists or error:', err.message);
    }

    // Step 5: Insert Amazon Business vendor
    console.log('Adding Amazon Business vendor...');
    try {
      await db.query(`
        INSERT INTO vendors (name, category, is_active, contact_email)
        VALUES ('Amazon Business', 'General Supplies', true, 'ab-integration@amazon.com')
        ON CONFLICT DO NOTHING;
      `);
      console.log('✓ Amazon Business vendor added');
    } catch (err) {
      console.log('ℹ Amazon Business vendor already exists or error:', err.message);
    }

    // Verify the table was created
    const result = await db.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = 'punchout_sessions'
    `);

    if (result.rows.length > 0) {
      console.log('\n✓ Migration completed successfully!');
    }

    // Check if Amazon vendor exists
    const vendorResult = await db.query(
      "SELECT id, name FROM vendors WHERE name = 'Amazon Business'"
    );

    if (vendorResult.rows.length > 0) {
      console.log('✓ Amazon Business vendor exists (ID:', vendorResult.rows[0].id + ')');
    }

    process.exit(0);
  } catch (error) {
    console.error('\n✗ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

runMigration();
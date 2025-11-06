-- Migration: Add Amazon Punchout functionality
-- Description: Creates tables and updates needed for Amazon Business cXML punchout integration

-- Create punchout_sessions table
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

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_punchout_sessions_user_id ON punchout_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_punchout_sessions_buyer_cookie ON punchout_sessions(buyer_cookie);
CREATE INDEX IF NOT EXISTS idx_punchout_sessions_status ON punchout_sessions(status);

-- Add unique constraint for products SKU if not exists
-- This allows us to upsert Amazon products without duplicates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'products_sku_key'
  ) THEN
    ALTER TABLE products ADD CONSTRAINT products_sku_key UNIQUE (sku);
  END IF;
END $$;

-- Add unique constraint for cart_items (user + product) if not exists
-- This allows us to upsert cart items from punchout
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cart_items_user_product_key'
  ) THEN
    ALTER TABLE cart_items ADD CONSTRAINT cart_items_user_product_key UNIQUE (user_id, product_id);
  END IF;
END $$;

-- Insert Amazon Business as a vendor if not exists
INSERT INTO vendors (name, category, is_active, contact_email)
VALUES ('Amazon Business', 'General Supplies', true, 'ab-integration@amazon.com')
ON CONFLICT (name) DO NOTHING;

-- Add comments for documentation
COMMENT ON TABLE punchout_sessions IS 'Tracks punchout sessions for vendor integrations (e.g., Amazon Business)';
COMMENT ON COLUMN punchout_sessions.buyer_cookie IS 'Unique identifier for the punchout session, returned by vendor';
COMMENT ON COLUMN punchout_sessions.request_xml IS 'Original cXML PunchOutSetupRequest sent to vendor';
COMMENT ON COLUMN punchout_sessions.response_xml IS 'cXML PunchOutOrderMessage received from vendor';
COMMENT ON COLUMN punchout_sessions.status IS 'Session status: initiated, completed, failed, cancelled';

-- Grant permissions (adjust as needed for your database user)
-- GRANT SELECT, INSERT, UPDATE ON punchout_sessions TO your_app_user;
-- GRANT USAGE, SELECT ON SEQUENCE punchout_sessions_id_seq TO your_app_user;
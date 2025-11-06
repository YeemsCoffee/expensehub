-- Add Xero sync fields to expenses table
ALTER TABLE expenses
ADD COLUMN IF NOT EXISTS xero_invoice_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS xero_synced_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS line_items JSONB,
ADD COLUMN IF NOT EXISTS veryfi_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS veryfi_url TEXT;

-- Create index for Xero invoice lookups
CREATE INDEX IF NOT EXISTS idx_expenses_xero_invoice ON expenses(xero_invoice_id);
CREATE INDEX IF NOT EXISTS idx_expenses_veryfi_id ON expenses(veryfi_id);

-- Create Xero connection table for storing OAuth tokens
CREATE TABLE IF NOT EXISTS xero_connections (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  tenant_id VARCHAR(255) NOT NULL,
  tenant_name VARCHAR(255),
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  id_token TEXT,
  expires_at TIMESTAMP NOT NULL,
  token_type VARCHAR(50) DEFAULT 'Bearer',
  scope TEXT,
  session_state VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, tenant_id)
);

-- Create Xero account mapping table
CREATE TABLE IF NOT EXISTS xero_account_mappings (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  tenant_id VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  xero_account_code VARCHAR(50) NOT NULL,
  xero_account_name VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, tenant_id, category)
);

-- Create index for active connections
CREATE INDEX IF NOT EXISTS idx_xero_connections_active ON xero_connections(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_xero_account_mappings_user ON xero_account_mappings(user_id, tenant_id);

-- Add comments for documentation
COMMENT ON COLUMN expenses.xero_invoice_id IS 'Xero invoice/bill ID after sync';
COMMENT ON COLUMN expenses.xero_synced_at IS 'Timestamp when expense was synced to Xero';
COMMENT ON COLUMN expenses.line_items IS 'Itemized line items from receipt OCR (JSON array)';
COMMENT ON COLUMN expenses.veryfi_id IS 'Veryfi document ID for receipt processing';
COMMENT ON COLUMN expenses.veryfi_url IS 'URL to view processed receipt in Veryfi';

COMMENT ON TABLE xero_connections IS 'Stores Xero OAuth tokens and tenant connections';
COMMENT ON TABLE xero_account_mappings IS 'Maps expense categories to Xero chart of accounts';

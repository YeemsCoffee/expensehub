-- Migration: Xero organisation selection, per-grant tokens, mapping clean-up
--
-- Fixes three verified defects:
--  1. The Xero Settings page and auto-sync used whichever xero_connections row
--     was written most recently, so they could show (and post to) a different
--     organisation - often Xero's Demo Company - than the one the admin uses.
--     An explicit default organisation now decides this.
--  2. One OAuth grant's rotating refresh token was copied into every tenant row
--     and refreshed per row, so refreshing one organisation invalidated the
--     others. grant_id lets all rows of a grant be refreshed together.
--  3. create_expense_categories.sql seeded account codes taken from Xero's Demo
--     Company numbering with mismatched names (e.g. 404 is "Bank Fees" in Xero's
--     default chart, not "General Expenses"), and expenses were posting to them.
--  4. The OAuth callback trusted an unsigned state, so anyone could complete a
--     connection. States are now issued and checked server-side, and each
--     connection records which Xero user authorised it.

-- Columns existing code already relies on (no-ops where present)
ALTER TABLE xero_connections ADD COLUMN IF NOT EXISTS is_organization_wide BOOLEAN DEFAULT false;
ALTER TABLE xero_account_mappings ADD COLUMN IF NOT EXISTS is_organization_wide BOOLEAN DEFAULT false;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS xero_sync_error TEXT;

-- The organisation approved expenses are synced to
ALTER TABLE xero_connections ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;
-- The OAuth grant these tokens belong to (shared by every org authorised together)
ALTER TABLE xero_connections ADD COLUMN IF NOT EXISTS grant_id VARCHAR(64);
-- Xero's /connections id for the org
ALTER TABLE xero_connections ADD COLUMN IF NOT EXISTS xero_connection_id VARCHAR(64);
ALTER TABLE xero_connections ADD COLUMN IF NOT EXISTS is_demo_company BOOLEAN NOT NULL DEFAULT false;
-- The Xero user who authorised the grant (id_token claim xero_userid). Xero's
-- GET /connections lists only that user's connections, so a reconnect may
-- only deactivate organisations of the same Xero user.
ALTER TABLE xero_connections ADD COLUMN IF NOT EXISTS xero_user_id VARCHAR(64);

-- OAuth state issued by /api/xero/connect: single use, bound to the admin who
-- started the flow, checked by the (unauthenticated) callback
CREATE TABLE IF NOT EXISTS xero_oauth_states (
  state VARCHAR(128) PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL
);

-- Rows that hold the same refresh token were written by the same grant
UPDATE xero_connections
SET grant_id = md5(refresh_token)
WHERE grant_id IS NULL AND refresh_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_xero_connections_grant_id ON xero_connections(grant_id);

-- At most one default among active organisation-wide connections
CREATE UNIQUE INDEX IF NOT EXISTS idx_xero_connections_single_default
  ON xero_connections (is_default)
  WHERE is_default AND is_active AND is_organization_wide;

-- If exactly one organisation is connected it becomes the default. With
-- several, the admin is asked to choose on the Xero Settings page rather than
-- the app guessing. Nothing is chosen for them if a choice already exists.
UPDATE xero_connections
SET is_default = true
WHERE id = (
  SELECT MAX(id) FROM xero_connections WHERE is_active AND is_organization_wide
)
AND (
  SELECT COUNT(DISTINCT tenant_id) FROM xero_connections WHERE is_active AND is_organization_wide
) = 1
AND NOT EXISTS (
  SELECT 1 FROM xero_connections WHERE is_default AND is_organization_wide
);

-- Store Xero's AccountID with each mapping so an account that is re-coded in
-- Xero still resolves, and a deleted one is detected instead of matching a
-- different account that later reuses the code.
ALTER TABLE xero_account_mappings ADD COLUMN IF NOT EXISTS xero_account_id VARCHAR(64);

-- Clear the Demo-Company account codes seeded by create_expense_categories.sql.
-- Only untouched seed values are cleared; codes an admin entered are kept.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'expense_categories' AND table_schema = 'public'
  ) THEN
    UPDATE expense_categories
    SET xero_account_code = NULL,
        xero_account_name = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE (name, xero_account_code, xero_account_name) IN (
      ('Travel', '493', 'Travel - National'),
      ('Meals & Entertainment', '420', 'Entertainment'),
      ('Office Supplies', '461', 'Office Expenses'),
      ('Software & Subscriptions', '453', 'Computer Expenses'),
      ('Equipment & Hardware', '630', 'Equipment Purchases'),
      ('Professional Services', '404', 'General Expenses'),
      ('Marketing & Advertising', '400', 'Advertising'),
      ('Utilities & Telecom', '445', 'Telephone & Internet'),
      ('Fuel & Mileage', '404', 'General Expenses'),
      ('Other', '404', 'General Expenses')
    );
  END IF;
END $$;

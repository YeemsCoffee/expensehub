-- Migration to convert Xero integration from per-user to organization-wide

-- Step 1: Make user_id nullable (organization connection doesn't belong to one user)
ALTER TABLE xero_connections
ALTER COLUMN user_id DROP NOT NULL;

-- Step 2: Add organization-wide flag
ALTER TABLE xero_connections
ADD COLUMN IF NOT EXISTS is_organization_wide BOOLEAN DEFAULT false;

-- Step 3: Update the unique constraint to allow one org-wide connection per tenant
ALTER TABLE xero_connections
DROP CONSTRAINT IF EXISTS xero_connections_user_id_tenant_id_key;

-- Add new constraint: either user-specific OR organization-wide (not both)
ALTER TABLE xero_connections
ADD CONSTRAINT xero_connections_unique_constraint
  UNIQUE NULLS NOT DISTINCT (user_id, tenant_id, is_organization_wide);

-- Step 4: Add connected_by field to track which admin set it up
ALTER TABLE xero_connections
ADD COLUMN IF NOT EXISTS connected_by_user_id INTEGER REFERENCES users(id);

-- Step 5: Update account mappings to be organization-wide too
ALTER TABLE xero_account_mappings
ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE xero_account_mappings
ADD COLUMN IF NOT EXISTS is_organization_wide BOOLEAN DEFAULT false;

ALTER TABLE xero_account_mappings
DROP CONSTRAINT IF EXISTS xero_account_mappings_user_id_tenant_id_category_key;

ALTER TABLE xero_account_mappings
ADD CONSTRAINT xero_account_mappings_unique_constraint
  UNIQUE NULLS NOT DISTINCT (user_id, tenant_id, category, is_organization_wide);

-- Add comment
COMMENT ON COLUMN xero_connections.is_organization_wide IS 'True if this connection is shared across all users in the organization';
COMMENT ON COLUMN xero_connections.connected_by_user_id IS 'Admin user who set up the organization-wide connection';
COMMENT ON COLUMN xero_account_mappings.is_organization_wide IS 'True if this mapping applies to all users in the organization';

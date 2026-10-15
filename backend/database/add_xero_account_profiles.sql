-- Migration: Xero account profiles
--
-- Stores post the same kind of expense to different Xero accounts (e.g. Rent
-- is 3000 for Ktown and 3001 for Gardena). An account profile holds its own
-- category -> account mappings; each employee is assigned a profile and their
-- expenses post with it. Mappings without a profile are shared by every
-- profile (a profile's own mapping wins) and used for employees without one.

CREATE TABLE IF NOT EXISTS xero_account_profiles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_xero_account_profiles_name
  ON xero_account_profiles (LOWER(name));

-- The profile an employee's expenses post with (NULL: shared mappings only)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS account_profile_id INTEGER
  REFERENCES xero_account_profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_users_account_profile ON users(account_profile_id);

-- The profile a mapping belongs to (NULL: shared by all profiles)
ALTER TABLE xero_account_mappings
  ADD COLUMN IF NOT EXISTS account_profile_id INTEGER
  REFERENCES xero_account_profiles(id) ON DELETE CASCADE;

-- One mapping per category per profile. The old unique constraint (named
-- differently depending on which earlier migrations ran) allowed only one
-- per category, so replace whichever exists.
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'xero_account_mappings'::regclass AND contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE xero_account_mappings DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_xero_account_mappings_unique
  ON xero_account_mappings (
    COALESCE(user_id, 0), tenant_id, category, is_organization_wide, COALESCE(account_profile_id, 0)
  );

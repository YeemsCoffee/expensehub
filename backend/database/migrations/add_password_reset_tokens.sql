-- Migration: Add password reset token fields to users table
-- Created: 2025-11-10

-- Add password reset token and expiry fields
ALTER TABLE users
ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255),
ADD COLUMN IF NOT EXISTS reset_token_expires_at TIMESTAMP;

-- Add index for faster token lookups
CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users(reset_token);

-- Add comments for documentation
COMMENT ON COLUMN users.reset_token IS 'Hashed token for password reset, expires after 1 hour';
COMMENT ON COLUMN users.reset_token_expires_at IS 'Expiration timestamp for reset token';

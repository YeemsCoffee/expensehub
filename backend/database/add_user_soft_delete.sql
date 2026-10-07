-- Migration: Soft-delete support for users
-- Purpose: Allow administrators to remove a user "regardless" of history.
--
-- A hard DELETE is not viable here: 20+ foreign keys reference users(id)
-- (expenses.approved_by, project_documents.uploaded_by, change requests,
-- xero_connections.connected_by_user_id, ...), most with no ON DELETE rule,
-- so deleting anyone who ever approved or uploaded anything fails outright.
-- The one cascading FK (expenses.user_id) would instead erase approved
-- expenses, Amazon POs and Xero-synced bills - unacceptable for finance data.
--
-- Soft delete keeps every row and FK intact. The DELETE route marks the user
-- deleted, deactivates them, and anonymises their PII so the email and
-- employee_id become reusable.

ALTER TABLE users
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

COMMENT ON COLUMN users.deleted_at IS 'Set when an admin deletes the user. Row is kept for referential and audit integrity; PII is anonymised.';

-- The user list only ever shows non-deleted rows.
CREATE INDEX IF NOT EXISTS idx_users_not_deleted ON users(created_at DESC) WHERE deleted_at IS NULL;

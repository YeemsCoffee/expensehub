-- Diagnose why a submitted expense/order did not appear in an approver's queue.
-- Run with: psql "$DATABASE_URL" -f backend/scripts/diagnose-approvals.sql

-- 1. Recent submissions with their routing outcome.
--    "SELF-APPROVED (no chain)" rows never reached anyone's queue.
SELECT
  e.id,
  e.created_at,
  u.email                                  AS submitter,
  u.role                                   AS submitter_role,
  m.email                                  AS submitter_manager,
  e.amount,
  e.status,
  e.amazon_order_status,
  e.current_approval_level,
  CASE
    WHEN e.approval_chain IS NULL AND e.status = 'approved' AND u.role = 'employee'
      THEN 'SELF-APPROVED (no chain) - check manager/rule'
    WHEN e.approval_chain IS NULL THEN 'no approval required'
    ELSE 'routed'
  END                                      AS routing,
  (SELECT string_agg(
            coalesce(step->>'user_name', 'Administrator') || ' (L' || (step->>'level') || ' ' || (step->>'status') || ')',
            ' -> ' ORDER BY (step->>'level')::int)
     FROM jsonb_array_elements(e.approval_chain) step) AS chain
FROM expenses e
JOIN users u ON u.id = e.user_id
LEFT JOIN users m ON m.id = u.manager_id
WHERE e.created_at > now() - interval '30 days'
ORDER BY e.created_at DESC
LIMIT 50;

-- 2. Employees who cannot be routed: no manager, or manager inactive / not an approver.
SELECT
  u.id, u.email, u.role, u.is_active,
  u.manager_id,
  m.email      AS manager_email,
  m.role       AS manager_role,
  m.is_active  AS manager_active,
  CASE
    WHEN u.manager_id IS NULL THEN 'NO MANAGER ASSIGNED'
    WHEN m.id IS NULL THEN 'MANAGER ROW MISSING'
    WHEN NOT m.is_active THEN 'MANAGER INACTIVE'
    WHEN m.role NOT IN ('manager','admin','developer') THEN 'MANAGER CANNOT APPROVE (role=' || m.role || ')'
    ELSE 'ok'
  END AS problem
FROM users u
LEFT JOIN users m ON m.id = u.manager_id
WHERE u.role = 'employee' AND u.is_active = true
ORDER BY problem, u.email;

-- 3. Active approval rules and any amount gaps.
SELECT id, name, min_amount, max_amount, levels_required, cost_center_id, is_active
FROM approval_rules
ORDER BY cost_center_id NULLS FIRST, min_amount;

-- 4. Pending items and who is currently expected to act.
SELECT
  e.id, e.created_at, u.email AS submitter, e.amount, e.current_approval_level,
  (SELECT coalesce(step->>'user_name','Administrator')
     FROM jsonb_array_elements(e.approval_chain) step
    WHERE (step->>'level')::int = e.current_approval_level
    LIMIT 1) AS waiting_on
FROM expenses e
JOIN users u ON u.id = e.user_id
WHERE e.status = 'pending'
ORDER BY e.created_at;

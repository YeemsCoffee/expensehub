/**
 * Approval routing service.
 *
 * Single source of truth for "who has to approve this expense?" so that cart
 * checkout and direct expense submission behave identically.
 *
 * Chain step shape (stored in expenses.approval_chain as JSONB):
 *   {
 *     level: 1,
 *     user_id: 42,            // specific approver, or null when role-based
 *     role: 'admin',          // present only for the admin fallback step
 *     user_name: 'Jane Doe',
 *     user_email: 'jane@x',   // null for role-based steps
 *     notify_emails: [...],   // role-based steps: who to email on submission
 *     status: 'pending' | 'approved' | 'rejected',
 *     fallback_reason: '...'  // why a role-based step was used
 *   }
 */

const APPROVER_ROLES = ['manager', 'admin', 'developer'];
const PRIVILEGED_ROLES = ['admin', 'developer'];

function isPrivilegedRole(role) {
  return PRIVILEGED_ROLES.includes(role);
}

function parseChain(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch (err) {
      return null;
    }
  }
  return Array.isArray(raw) ? raw : null;
}

function getCurrentStep(expense) {
  const chain = parseChain(expense.approval_chain);
  if (!chain) return null;
  return chain.find(step => Number(step.level) === Number(expense.current_approval_level)) || null;
}

/**
 * Can `user` act on `step`?  A step names either a specific user_id or the
 * 'admin' role (fallback when no usable manager exists).
 */
function isStepApprover(step, user) {
  if (!step || !user) return false;
  if (step.user_id !== null && step.user_id !== undefined && Number(step.user_id) === Number(user.id)) {
    return true;
  }
  if (step.role === 'admin' && isPrivilegedRole(user.role)) {
    return true;
  }
  return false;
}

/** Email recipients for a step (a named approver, or every active admin). */
function approverRecipients(step) {
  if (!step) return [];
  if (step.user_email) {
    return [{ name: step.user_name, email: step.user_email }];
  }
  return (step.notify_emails || []).map(email => ({
    name: step.user_name || 'Administrator',
    email
  }));
}

async function buildAdminFallbackStep(db, reason) {
  const admins = await db.query(
    `SELECT email FROM users
     WHERE role IN ('admin', 'developer') AND is_active = true
     ORDER BY id`
  );
  return {
    level: 0, // renumbered by caller
    user_id: null,
    role: 'admin',
    user_name: 'Administrator',
    user_email: null,
    notify_emails: admins.rows.map(r => r.email),
    status: 'pending',
    fallback_reason: reason
  };
}

/**
 * Build the approval chain for a submission.
 *
 * Returns { approvalChain, approvalRuleId, autoApproved, reason } where
 * reason is one of:
 *   'privileged_role'   - admin/developer submitted, no approval needed
 *   'no_matching_rule'  - no active approval rule covers this amount
 *   'manager_chain'     - routed up the org chart
 *   'admin_fallback'    - at least one level routed to administrators because
 *                         the submitter (or a manager in the chain) has no
 *                         usable manager assigned
 *
 * Previously, a submitter with no manager was silently auto-approved.  That
 * let purchases bypass every approver, so the fallback now routes to admins.
 */
async function buildApprovalChain(db, { user, amount, costCenterId }) {
  if (isPrivilegedRole(user.role)) {
    return { approvalChain: null, approvalRuleId: null, autoApproved: true, reason: 'privileged_role' };
  }

  const ruleResult = await db.query(
    'SELECT find_approval_rule($1, $2) AS rule_id',
    [amount, costCenterId || null]
  );
  const approvalRuleId = ruleResult.rows[0]?.rule_id || null;

  if (!approvalRuleId) {
    return { approvalChain: null, approvalRuleId: null, autoApproved: true, reason: 'no_matching_rule' };
  }

  const ruleRows = await db.query(
    'SELECT levels_required FROM approval_rules WHERE id = $1',
    [approvalRuleId]
  );
  const levelsRequired = ruleRows.rows[0]?.levels_required || 1;

  const chainResult = await db.query(
    'SELECT * FROM get_manager_chain($1, $2)',
    [user.id, levelsRequired]
  );

  // get_manager_chain does not check that a manager is active or actually
  // allowed to approve, so verify here.
  const managerIds = chainResult.rows.map(r => r.manager_id);
  let managerInfo = {};
  if (managerIds.length > 0) {
    const infoResult = await db.query(
      'SELECT id, role, is_active FROM users WHERE id = ANY($1::int[])',
      [managerIds]
    );
    managerInfo = Object.fromEntries(infoResult.rows.map(r => [r.id, r]));
  }

  const steps = [];
  for (const row of chainResult.rows) {
    const info = managerInfo[row.manager_id];
    const usable = info && info.is_active && APPROVER_ROLES.includes(info.role);

    if (usable) {
      steps.push({
        level: 0,
        user_id: row.manager_id,
        user_name: row.manager_name,
        user_email: row.manager_email,
        status: 'pending'
      });
      continue;
    }

    const reason = !info
      ? 'manager_missing'
      : !info.is_active
        ? 'manager_inactive'
        : 'manager_not_approver_role';

    // Collapse consecutive admin fallbacks into one level.
    const last = steps[steps.length - 1];
    if (!last || last.role !== 'admin') {
      steps.push(await buildAdminFallbackStep(db, reason));
    }
  }

  if (steps.length === 0) {
    steps.push(await buildAdminFallbackStep(db, 'no_manager_assigned'));
  }

  steps.forEach((step, index) => {
    step.level = index + 1;
  });

  const usedFallback = steps.some(step => step.role === 'admin');
  return {
    approvalChain: steps,
    approvalRuleId,
    autoApproved: false,
    reason: usedFallback ? 'admin_fallback' : 'manager_chain'
  };
}

module.exports = {
  APPROVER_ROLES,
  PRIVILEGED_ROLES,
  isPrivilegedRole,
  parseChain,
  getCurrentStep,
  isStepApprover,
  approverRecipients,
  buildApprovalChain
};

const pool = require('../db');

/**
 * Audit Log Middleware
 * Automatically logs all actions to the audit_log table
 *
 * Usage: router.post('/endpoint', auth, auditLog('ACTION_TYPE'), handler)
 */
function auditLog(actionType) {
  return async (req, res, next) => {
    // Store original send/json functions
    const originalJson = res.json;
    const originalSend = res.send;

    // Track start time
    const startTime = Date.now();

    // Override res.json to capture response
    res.json = function(data) {
      logAuditEntry(req, res, actionType, data, null);
      return originalJson.call(this, data);
    };

    // Override res.send for error handling
    res.send = function(data) {
      logAuditEntry(req, res, actionType, data, null);
      return originalSend.call(this, data);
    };

    // Capture errors
    const originalNext = next;
    next = function(err) {
      if (err) {
        logAuditEntry(req, res, actionType, null, err);
      }
      return originalNext(err);
    };

    next();
  };
}

/**
 * Log audit entry to database
 */
async function logAuditEntry(req, res, actionType, responseData, error) {
  try {
    const userId = req.user ? req.user.id : null;
    const username = req.user ? `${req.user.first_name} ${req.user.last_name}` : 'Anonymous';

    // Determine table and record ID from request
    const tableName = determineTableName(req);
    const recordId = extractRecordId(req);

    // Extract old and new values from request (if attached by route handler)
    const oldValues = req.auditData?.oldValues || extractOldValues(req.auditData);
    const newValues = req.auditData?.newValues || extractNewValues(req.auditData);
    const changedFields = identifyChangedFields(oldValues, newValues);

    // Create human-readable description
    const description = generateDescription(actionType, req, tableName, recordId);

    // Determine action status
    const actionStatus = error || res.statusCode >= 400 ? 'failure' : 'success';
    const errorMessage = error ? error.message : (res.statusCode >= 400 ? responseData?.error : null);

    // Extract business context
    const projectId = req.body?.project_id || req.params?.projectId || req.auditData?.project_id || null;
    const expenseId = req.body?.expense_id || req.params?.expenseId || req.auditData?.expense_id || null;
    const changeRequestId = req.body?.change_request_id || req.params?.id || req.auditData?.change_request_id || null;

    // Extract request metadata
    const ipAddress = req.ip || req.connection?.remoteAddress || null;
    const userAgent = req.get('user-agent') || null;
    const sessionId = req.session?.id || null;
    const requestMethod = req.method;
    const requestUrl = req.originalUrl || req.url;

    // Additional metadata
    const metadata = {
      params: req.params,
      query: req.query,
      bodyKeys: req.body ? Object.keys(req.body) : [],
      statusCode: res.statusCode
    };

    // Insert audit log entry
    await pool.query(
      `INSERT INTO audit_log
       (user_id, username, action_type, table_name, record_id, action_description,
        old_values, new_values, changed_fields, ip_address, user_agent, session_id,
        request_method, request_url, project_id, expense_id, change_request_id,
        action_status, error_message, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
      [
        userId,
        username,
        actionType,
        tableName,
        recordId,
        description,
        oldValues ? JSON.stringify(oldValues) : null,
        newValues ? JSON.stringify(newValues) : null,
        changedFields,
        ipAddress,
        userAgent,
        sessionId,
        requestMethod,
        requestUrl,
        projectId,
        expenseId,
        changeRequestId,
        actionStatus,
        errorMessage,
        JSON.stringify(metadata)
      ]
    );

    // If project-related, also log to project_audit_trail
    if (projectId && tableName === 'projects') {
      await logProjectAudit(projectId, userId, actionType, changedFields, oldValues, newValues, ipAddress);
    }

  } catch (err) {
    // Don't fail the request if audit logging fails
    console.error('Audit log error:', err);
  }
}

/**
 * Log to project-specific audit trail
 */
async function logProjectAudit(projectId, userId, actionType, changedFields, oldValues, newValues, ipAddress) {
  try {
    if (!changedFields || changedFields.length === 0) {
      // No field changes, log general action
      await pool.query(
        `INSERT INTO project_audit_trail
         (project_id, user_id, action_type, description, ip_address)
         VALUES ($1, $2, $3, $4, $5)`,
        [projectId, userId, actionType, `Performed ${actionType}`, ipAddress]
      );
      return;
    }

    // Log each field change
    for (const field of changedFields) {
      const oldValue = oldValues?.[field];
      const newValue = newValues?.[field];

      await pool.query(
        `INSERT INTO project_audit_trail
         (project_id, user_id, action_type, field_name, old_value, new_value, description, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          projectId,
          userId,
          actionType,
          field,
          oldValue ? String(oldValue) : null,
          newValue ? String(newValue) : null,
          `Changed ${field} from "${oldValue}" to "${newValue}"`,
          ipAddress
        ]
      );
    }
  } catch (err) {
    console.error('Project audit trail error:', err);
  }
}

/**
 * Determine table name from request
 */
function determineTableName(req) {
  const path = req.route?.path || req.path || '';

  if (path.includes('project') && path.includes('phase')) return 'project_phases';
  if (path.includes('milestone')) return 'project_milestones';
  if (path.includes('change-request')) return 'project_change_requests';
  if (path.includes('template')) return 'project_templates';
  if (path.includes('document')) return 'project_documents';
  if (path.includes('project')) return 'projects';
  if (path.includes('expense')) return 'expenses';
  if (path.includes('user')) return 'users';

  return 'unknown';
}

/**
 * Extract record ID from request
 */
function extractRecordId(req) {
  return req.params?.id || req.params?.projectId || req.params?.expenseId || null;
}

/**
 * Extract old values from audit data
 */
function extractOldValues(auditData) {
  if (!auditData) return null;

  return auditData.oldProject ||
         auditData.oldPhase ||
         auditData.oldMilestone ||
         auditData.oldChangeRequest ||
         auditData.oldDocument ||
         auditData.oldExpense ||
         null;
}

/**
 * Extract new values from audit data
 */
function extractNewValues(auditData) {
  if (!auditData) return null;

  return auditData.newProject ||
         auditData.project ||
         auditData.newPhase ||
         auditData.phase ||
         auditData.newMilestone ||
         auditData.milestone ||
         auditData.newChangeRequest ||
         auditData.changeRequest ||
         auditData.newDocument ||
         auditData.document ||
         auditData.newExpense ||
         auditData.expense ||
         null;
}

/**
 * Identify which fields changed
 */
function identifyChangedFields(oldValues, newValues) {
  if (!oldValues || !newValues) return [];

  const changes = [];

  for (const key in newValues) {
    if (oldValues[key] !== newValues[key]) {
      changes.push(key);
    }
  }

  return changes;
}

/**
 * Generate human-readable description
 */
function generateDescription(actionType, req, tableName, recordId) {
  const user = req.user ? `${req.user.first_name} ${req.user.last_name}` : 'User';
  const id = recordId || 'unknown';

  const descriptions = {
    // Project actions
    'CREATE_PROJECT': `${user} created a new project`,
    'UPDATE_PROJECT': `${user} updated project #${id}`,
    'DELETE_PROJECT': `${user} deleted project #${id}`,
    'APPROVE_PROJECT': `${user} approved project #${id}`,
    'REJECT_PROJECT': `${user} rejected project #${id}`,

    // Phase actions
    'CREATE_PROJECT_PHASE': `${user} created a new project phase`,
    'UPDATE_PROJECT_PHASE': `${user} updated project phase #${id}`,
    'APPROVE_PHASE_GATE': `${user} approved phase gate for #${id}`,

    // Milestone actions
    'CREATE_MILESTONE': `${user} created a new milestone`,
    'UPDATE_MILESTONE': `${user} updated milestone #${id}`,
    'DELETE_MILESTONE': `${user} deleted milestone #${id}`,

    // Change request actions
    'CREATE_CHANGE_REQUEST': `${user} submitted a new change request`,
    'UPDATE_CHANGE_REQUEST': `${user} updated change request #${id}`,
    'REVIEW_CHANGE_REQUEST': `${user} reviewed change request #${id}`,
    'APPROVE_CHANGE_REQUEST_LEVEL': `${user} approved change request #${id} at approval level`,
    'IMPLEMENT_CHANGE_REQUEST': `${user} marked change request #${id} as implemented`,

    // Document actions
    'UPLOAD_DOCUMENT': `${user} uploaded a document`,
    'UPDATE_DOCUMENT': `${user} updated document #${id}`,
    'DELETE_DOCUMENT': `${user} deleted document #${id}`,
    'APPROVE_DOCUMENT': `${user} approved document #${id}`,

    // View actions
    'VIEW_PROJECT_PHASES': `${user} viewed project phases`,
    'VIEW_PROJECT_MILESTONES': `${user} viewed project milestones`,
    'VIEW_CHANGE_REQUESTS': `${user} viewed change requests`,
    'VIEW_CHANGE_REQUEST': `${user} viewed change request #${id}`,

    // Expense actions
    'CREATE_EXPENSE': `${user} created a new expense`,
    'UPDATE_EXPENSE': `${user} updated expense #${id}`,
    'APPROVE_EXPENSE': `${user} approved expense #${id}`,
    'REJECT_EXPENSE': `${user} rejected expense #${id}`,
  };

  return descriptions[actionType] || `${user} performed ${actionType} on ${tableName} #${id}`;
}

module.exports = { auditLog };

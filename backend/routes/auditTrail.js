const express = require('express');
const router = express.Router();
const { authMiddleware, isManagerOrAdmin } = require('../middleware/auth');
const db = require('../config/database');

// ============================================================================
// AUDIT TRAIL ROUTES (View Only - No Modifications)
// ============================================================================

/**
 * GET /api/audit-trail
 * Get audit log entries with filters
 */
router.get('/', authMiddleware, isManagerOrAdmin, async (req, res) => {
  try {
    const {
      user_id,
      action_type,
      table_name,
      project_id,
      expense_id,
      start_date,
      end_date,
      limit = 100,
      offset = 0
    } = req.query;

    let query = `
      SELECT al.*
      FROM audit_log al
      WHERE 1=1
    `;

    const params = [];
    let paramCount = 1;

    // Apply filters
    if (user_id) {
      query += ` AND al.user_id = $${paramCount}`;
      params.push(user_id);
      paramCount++;
    }

    if (action_type) {
      query += ` AND al.action_type = $${paramCount}`;
      params.push(action_type);
      paramCount++;
    }

    if (table_name) {
      query += ` AND al.table_name = $${paramCount}`;
      params.push(table_name);
      paramCount++;
    }

    if (project_id) {
      query += ` AND al.project_id = $${paramCount}`;
      params.push(project_id);
      paramCount++;
    }

    if (expense_id) {
      query += ` AND al.expense_id = $${paramCount}`;
      params.push(expense_id);
      paramCount++;
    }

    if (start_date) {
      query += ` AND al.action_timestamp >= $${paramCount}`;
      params.push(start_date);
      paramCount++;
    }

    if (end_date) {
      query += ` AND al.action_timestamp <= $${paramCount}`;
      params.push(end_date);
      paramCount++;
    }

    query += ` ORDER BY al.action_timestamp DESC`;
    query += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);

    const result = await db.query(query, params);

    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(*) as total
      FROM audit_log al
      WHERE 1=1
    `;

    const countParams = params.slice(0, -2); // Remove limit and offset

    if (user_id) countQuery += ` AND al.user_id = $1`;
    if (action_type) countQuery += ` AND al.action_type = $${countParams.indexOf(action_type) + 1}`;
    if (table_name) countQuery += ` AND al.table_name = $${countParams.indexOf(table_name) + 1}`;
    if (project_id) countQuery += ` AND al.project_id = $${countParams.indexOf(project_id) + 1}`;
    if (expense_id) countQuery += ` AND al.expense_id = $${countParams.indexOf(expense_id) + 1}`;
    if (start_date) countQuery += ` AND al.action_timestamp >= $${countParams.indexOf(start_date) + 1}`;
    if (end_date) countQuery += ` AND al.action_timestamp <= $${countParams.indexOf(end_date) + 1}`;

    const countResult = await db.query(countQuery, countParams);

    res.json({
      entries: result.rows,
      total: parseInt(countResult.rows[0].total),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (err) {
    console.error('Error fetching audit trail:', err);
    res.status(500).json({ error: 'Failed to fetch audit trail' });
  }
});

/**
 * GET /api/audit-trail/project/:projectId
 * Get project-specific audit trail
 */
router.get('/project/:projectId', authMiddleware, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { limit = 100, offset = 0 } = req.query;

    const result = await db.query(
      `SELECT pa.*
       FROM project_audit_trail pa
       WHERE pa.project_id = $1
       ORDER BY pa.timestamp DESC
       LIMIT $2 OFFSET $3`,
      [projectId, limit, offset]
    );

    // Get total count
    const countResult = await db.query(
      'SELECT COUNT(*) as total FROM project_audit_trail WHERE project_id = $1',
      [projectId]
    );

    res.json({
      entries: result.rows,
      total: parseInt(countResult.rows[0].total),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (err) {
    console.error('Error fetching project audit trail:', err);
    res.status(500).json({ error: 'Failed to fetch project audit trail' });
  }
});

/**
 * GET /api/audit-trail/record/:tableName/:recordId
 * Get audit trail for a specific record
 */
router.get('/record/:tableName/:recordId', authMiddleware, async (req, res) => {
  try {
    const { tableName, recordId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const result = await db.query(
      `SELECT al.*
       FROM audit_log al
       WHERE al.table_name = $1 AND al.record_id = $2
       ORDER BY al.action_timestamp DESC
       LIMIT $3 OFFSET $4`,
      [tableName, recordId, limit, offset]
    );

    // Get total count
    const countResult = await db.query(
      `SELECT COUNT(*) as total
       FROM audit_log
       WHERE table_name = $1 AND record_id = $2`,
      [tableName, recordId]
    );

    res.json({
      entries: result.rows,
      total: parseInt(countResult.rows[0].total),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (err) {
    console.error('Error fetching record audit trail:', err);
    res.status(500).json({ error: 'Failed to fetch record audit trail' });
  }
});

/**
 * GET /api/audit-trail/user/:userId
 * Get all actions by a specific user
 */
router.get('/user/:userId', authMiddleware, isManagerOrAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 100, offset = 0, start_date, end_date } = req.query;

    let query = `
      SELECT al.*
      FROM audit_log al
      WHERE al.user_id = $1
    `;

    const params = [userId];
    let paramCount = 2;

    if (start_date) {
      query += ` AND al.action_timestamp >= $${paramCount}`;
      params.push(start_date);
      paramCount++;
    }

    if (end_date) {
      query += ` AND al.action_timestamp <= $${paramCount}`;
      params.push(end_date);
      paramCount++;
    }

    query += ` ORDER BY al.action_timestamp DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);

    const result = await db.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM audit_log WHERE user_id = $1';
    const countParams = [userId];

    if (start_date) {
      countQuery += ' AND action_timestamp >= $2';
      countParams.push(start_date);
    }

    if (end_date) {
      countQuery += ` AND action_timestamp <= $${countParams.length + 1}`;
      countParams.push(end_date);
    }

    const countResult = await db.query(countQuery, countParams);

    res.json({
      entries: result.rows,
      total: parseInt(countResult.rows[0].total),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (err) {
    console.error('Error fetching user audit trail:', err);
    res.status(500).json({ error: 'Failed to fetch user audit trail' });
  }
});

/**
 * GET /api/audit-trail/compare/:tableName/:recordId
 * Compare changes between two timestamps for a record
 */
router.get('/compare/:tableName/:recordId', authMiddleware, async (req, res) => {
  try {
    const { tableName, recordId } = req.params;
    const { from_timestamp, to_timestamp } = req.query;

    if (!from_timestamp || !to_timestamp) {
      return res.status(400).json({ error: 'from_timestamp and to_timestamp are required' });
    }

    const result = await db.query(
      `SELECT al.*
       FROM audit_log al
       WHERE al.table_name = $1
         AND al.record_id = $2
         AND al.action_timestamp BETWEEN $3 AND $4
       ORDER BY al.action_timestamp ASC`,
      [tableName, recordId, from_timestamp, to_timestamp]
    );

    // Aggregate all changes
    const changes = {};

    for (const entry of result.rows) {
      if (entry.changed_fields && entry.changed_fields.length > 0) {
        for (const field of entry.changed_fields) {
          if (!changes[field]) {
            changes[field] = {
              field: field,
              initial_value: entry.old_values?.[field],
              final_value: entry.new_values?.[field],
              change_count: 0,
              changed_by: []
            };
          }
          changes[field].final_value = entry.new_values?.[field];
          changes[field].change_count++;
          if (!changes[field].changed_by.includes(entry.username)) {
            changes[field].changed_by.push(entry.username);
          }
        }
      }
    }

    res.json({
      from_timestamp,
      to_timestamp,
      table_name: tableName,
      record_id: recordId,
      changes: Object.values(changes),
      change_log: result.rows
    });
  } catch (err) {
    console.error('Error comparing audit trail:', err);
    res.status(500).json({ error: 'Failed to compare audit trail' });
  }
});

/**
 * GET /api/audit-trail/stats
 * Get audit statistics (Manager/Admin only)
 */
router.get('/stats/summary', authMiddleware, isManagerOrAdmin, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    let whereClause = '';
    const params = [];

    if (start_date && end_date) {
      whereClause = 'WHERE action_timestamp BETWEEN $1 AND $2';
      params.push(start_date, end_date);
    }

    // Action type distribution
    const actionTypeStats = await db.query(
      `SELECT action_type, COUNT(*) as count
       FROM audit_log
       ${whereClause}
       GROUP BY action_type
       ORDER BY count DESC`,
      params
    );

    // User activity
    const userActivityStats = await db.query(
      `SELECT username, COUNT(*) as action_count
       FROM audit_log
       ${whereClause}
       GROUP BY username
       ORDER BY action_count DESC
       LIMIT 10`,
      params
    );

    // Table activity
    const tableActivityStats = await db.query(
      `SELECT table_name, COUNT(*) as action_count
       FROM audit_log
       ${whereClause}
       GROUP BY table_name
       ORDER BY action_count DESC`,
      params
    );

    // Success vs Failure rate
    const statusStats = await db.query(
      `SELECT action_status, COUNT(*) as count
       FROM audit_log
       ${whereClause}
       GROUP BY action_status`,
      params
    );

    // Total actions
    const totalResult = await db.query(
      `SELECT COUNT(*) as total FROM audit_log ${whereClause}`,
      params
    );

    res.json({
      total_actions: parseInt(totalResult.rows[0].total),
      action_types: actionTypeStats.rows,
      top_users: userActivityStats.rows,
      table_activity: tableActivityStats.rows,
      status_distribution: statusStats.rows
    });
  } catch (err) {
    console.error('Error fetching audit stats:', err);
    res.status(500).json({ error: 'Failed to fetch audit statistics' });
  }
});

module.exports = router;

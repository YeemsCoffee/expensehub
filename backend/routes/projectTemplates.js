const express = require('express');
const router = express.Router();
const { authMiddleware, isManagerOrAdmin } = require('../middleware/auth');
const { auditLog } = require('../middleware/auditLog');
const db = require('../config/database');

// ============================================================================
// PROJECT TEMPLATES ROUTES
// ============================================================================

/**
 * GET /api/project-templates
 * Get all project templates (public + user's own)
 */
router.get('/', authMiddleware, auditLog('VIEW_PROJECT_TEMPLATES'), async (req, res) => {
  try {
    const result = await db.query(
      `SELECT pt.*,
              u.first_name || ' ' || u.last_name as created_by_name
       FROM project_templates pt
       LEFT JOIN users u ON pt.created_by = u.id
       WHERE pt.is_active = true
         AND (pt.is_public = true OR pt.created_by = $1)
       ORDER BY pt.name`,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching project templates:', err);
    res.status(500).json({ error: 'Failed to fetch project templates' });
  }
});

/**
 * GET /api/project-templates/:id
 * Get a specific template with all its components
 */
router.get('/:id', authMiddleware, auditLog('VIEW_PROJECT_TEMPLATE'), async (req, res) => {
  try {
    const { id } = req.params;

    // Get template
    const templateResult = await db.query(
      `SELECT pt.*,
              u.first_name || ' ' || u.last_name as created_by_name
       FROM project_templates pt
       LEFT JOIN users u ON pt.created_by = u.id
       WHERE pt.id = $1 AND pt.is_active = true`,
      [id]
    );

    if (templateResult.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const template = templateResult.rows[0];

    // Get phases
    const phasesResult = await db.query(
      `SELECT * FROM template_phases
       WHERE template_id = $1 AND is_active = true
       ORDER BY sequence_order`,
      [id]
    );

    // Get WBS elements
    const wbsResult = await db.query(
      `SELECT * FROM template_wbs_elements
       WHERE template_id = $1 AND is_active = true
       ORDER BY category`,
      [id]
    );

    // Get milestones
    const milestonesResult = await db.query(
      `SELECT * FROM template_milestones
       WHERE template_id = $1 AND is_active = true
       ORDER BY days_from_start`,
      [id]
    );

    template.phases = phasesResult.rows;
    template.wbs_elements = wbsResult.rows;
    template.milestones = milestonesResult.rows;

    res.json(template);
  } catch (err) {
    console.error('Error fetching project template:', err);
    res.status(500).json({ error: 'Failed to fetch project template' });
  }
});

/**
 * POST /api/project-templates
 * Create a new project template
 */
router.post('/', authMiddleware, isManagerOrAdmin, auditLog('CREATE_PROJECT_TEMPLATE'), async (req, res) => {
  const client = await db.pool.connect();
  try {
    const {
      name,
      description,
      template_code,
      industry,
      project_type,
      estimated_duration_days,
      estimated_budget,
      is_public,
      phases,
      wbs_elements,
      milestones
    } = req.body;

    // Validation
    if (!name || !template_code) {
      return res.status(400).json({ error: 'Name and template code are required' });
    }

    await client.query('BEGIN');

    // Create template
    const templateResult = await client.query(
      `INSERT INTO project_templates
       (name, description, template_code, industry, project_type,
        estimated_duration_days, estimated_budget, is_public, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [name, description, template_code, industry, project_type,
       estimated_duration_days, estimated_budget, is_public || false, req.user.id]
    );

    const template = templateResult.rows[0];

    // Create phases if provided
    if (phases && Array.isArray(phases)) {
      for (const phase of phases) {
        const phaseResult = await client.query(
          `INSERT INTO template_phases
           (template_id, name, description, sequence_order, duration_days,
            budget_percentage, gate_approval_required)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [template.id, phase.name, phase.description, phase.sequence_order,
           phase.duration_days, phase.budget_percentage, phase.gate_approval_required !== false]
        );

        phase.id = phaseResult.rows[0].id;
      }
    }

    // Create WBS elements if provided
    if (wbs_elements && Array.isArray(wbs_elements)) {
      for (const wbs of wbs_elements) {
        // Find phase ID if phase_name provided
        let phaseId = wbs.phase_id;
        if (!phaseId && wbs.phase_name && phases) {
          const matchingPhase = phases.find(p => p.name === wbs.phase_name);
          phaseId = matchingPhase?.id;
        }

        await client.query(
          `INSERT INTO template_wbs_elements
           (template_id, phase_id, category, description, budget_percentage)
           VALUES ($1, $2, $3, $4, $5)`,
          [template.id, phaseId, wbs.category, wbs.description, wbs.budget_percentage]
        );
      }
    }

    // Create milestones if provided
    if (milestones && Array.isArray(milestones)) {
      for (const milestone of milestones) {
        // Find phase ID if phase_name provided
        let phaseId = milestone.phase_id;
        if (!phaseId && milestone.phase_name && phases) {
          const matchingPhase = phases.find(p => p.name === milestone.phase_name);
          phaseId = matchingPhase?.id;
        }

        await client.query(
          `INSERT INTO template_milestones
           (template_id, phase_id, name, description, milestone_type,
            days_from_start, is_critical_path)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [template.id, phaseId, milestone.name, milestone.description,
           milestone.milestone_type, milestone.days_from_start, milestone.is_critical_path || false]
        );
      }
    }

    await client.query('COMMIT');

    req.auditData = { template };

    res.status(201).json(template);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error creating project template:', err);
    res.status(500).json({ error: 'Failed to create project template' });
  } finally {
    client.release();
  }
});

/**
 * POST /api/project-templates/:id/instantiate
 * Create a new project from a template
 */
router.post('/:id/instantiate', authMiddleware, isManagerOrAdmin, auditLog('INSTANTIATE_PROJECT_TEMPLATE'), async (req, res) => {
  const client = await db.pool.connect();
  try {
    const { id } = req.params;
    const {
      code,
      name,
      description,
      start_date,
      budget,
      project_manager
    } = req.body;

    // Validation
    if (!code || !name || !start_date) {
      return res.status(400).json({ error: 'Code, name, and start date are required' });
    }

    await client.query('BEGIN');

    // Get template with all components
    const templateResult = await client.query(
      'SELECT * FROM project_templates WHERE id = $1 AND is_active = true',
      [id]
    );

    if (templateResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Template not found' });
    }

    const template = templateResult.rows[0];

    // Calculate end_date based on template duration
    let end_date = null;
    if (start_date && template.estimated_duration_days) {
      const startDateObj = new Date(start_date);
      startDateObj.setDate(startDateObj.getDate() + template.estimated_duration_days);
      end_date = startDateObj.toISOString().split('T')[0];
    }

    // Create project
    const projectResult = await client.query(
      `INSERT INTO projects
       (code, name, description, start_date, end_date, budget, project_manager,
        template_id, created_from_template, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, 'active')
       RETURNING *`,
      [code, name, description || template.description, start_date, end_date,
       budget || template.estimated_budget, project_manager, template.id]
    );

    const project = projectResult.rows[0];

    // Get template phases
    const phasesResult = await client.query(
      `SELECT * FROM template_phases
       WHERE template_id = $1 AND is_active = true
       ORDER BY sequence_order`,
      [id]
    );

    const phaseMap = {}; // Map template phase IDs to project phase IDs

    // Create phases
    for (const templatePhase of phasesResult.rows) {
      let phaseStartDate = null;
      let phaseEndDate = null;

      if (start_date && templatePhase.duration_days) {
        // Calculate phase dates based on project start date
        const phaseStart = new Date(start_date);
        // Add cumulative duration of previous phases
        const previousPhases = phasesResult.rows.filter(p => p.sequence_order < templatePhase.sequence_order);
        const dayOffset = previousPhases.reduce((sum, p) => sum + (p.duration_days || 0), 0);
        phaseStart.setDate(phaseStart.getDate() + dayOffset);
        phaseStartDate = phaseStart.toISOString().split('T')[0];

        const phaseEnd = new Date(phaseStartDate);
        phaseEnd.setDate(phaseEnd.getDate() + templatePhase.duration_days);
        phaseEndDate = phaseEnd.toISOString().split('T')[0];
      }

      const phaseBudget = budget && templatePhase.budget_percentage
        ? (budget * templatePhase.budget_percentage / 100)
        : null;

      const phaseResult = await client.query(
        `INSERT INTO project_phases
         (project_id, name, description, sequence_order, planned_start_date,
          planned_end_date, budget_allocation, gate_approval_required)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [project.id, templatePhase.name, templatePhase.description,
         templatePhase.sequence_order, phaseStartDate, phaseEndDate,
         phaseBudget, templatePhase.gate_approval_required]
      );

      phaseMap[templatePhase.id] = phaseResult.rows[0].id;
    }

    // Get template WBS elements
    const wbsResult = await client.query(
      `SELECT * FROM template_wbs_elements
       WHERE template_id = $1 AND is_active = true`,
      [id]
    );

    // Create WBS elements
    let wbsCounter = 1;
    for (const templateWbs of wbsResult.rows) {
      const wbsCode = `${code}-${String(wbsCounter).padStart(2, '0')}`;
      const wbsBudget = budget && templateWbs.budget_percentage
        ? (budget * templateWbs.budget_percentage / 100)
        : 0;

      const phaseId = templateWbs.phase_id ? phaseMap[templateWbs.phase_id] : null;

      await client.query(
        `INSERT INTO project_wbs_elements
         (project_id, phase_id, code, category, description, budget_estimate)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [project.id, phaseId, wbsCode, templateWbs.category,
         templateWbs.description, wbsBudget]
      );

      wbsCounter++;
    }

    // Get template milestones
    const milestonesResult = await client.query(
      `SELECT * FROM template_milestones
       WHERE template_id = $1 AND is_active = true
       ORDER BY days_from_start`,
      [id]
    );

    // Create milestones
    for (const templateMilestone of milestonesResult.rows) {
      let milestonePlannedDate = null;

      if (start_date) {
        const milestoneDate = new Date(start_date);
        milestoneDate.setDate(milestoneDate.getDate() + templateMilestone.days_from_start);
        milestonePlannedDate = milestoneDate.toISOString().split('T')[0];
      }

      const phaseId = templateMilestone.phase_id ? phaseMap[templateMilestone.phase_id] : null;

      await client.query(
        `INSERT INTO project_milestones
         (project_id, phase_id, name, description, milestone_type,
          planned_date, is_critical_path)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [project.id, phaseId, templateMilestone.name, templateMilestone.description,
         templateMilestone.milestone_type, milestonePlannedDate, templateMilestone.is_critical_path]
      );
    }

    await client.query('COMMIT');

    req.auditData = {
      template_id: template.id,
      project_id: project.id,
      project
    };

    res.status(201).json(project);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error instantiating project template:', err);
    res.status(500).json({ error: 'Failed to create project from template' });
  } finally {
    client.release();
  }
});

/**
 * DELETE /api/project-templates/:id
 * Soft delete a template
 */
router.delete('/:id', authMiddleware, isManagerOrAdmin, auditLog('DELETE_PROJECT_TEMPLATE'), async (req, res) => {
  const client = await db.pool.connect();
  try {
    const { id } = req.params;

    await client.query('BEGIN');

    // Check if user owns the template or is admin
    const templateResult = await client.query(
      'SELECT * FROM project_templates WHERE id = $1',
      [id]
    );

    if (templateResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Template not found' });
    }

    const template = templateResult.rows[0];

    if (template.created_by !== req.user.id && req.user.role !== 'admin') {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Not authorized to delete this template' });
    }

    // Soft delete
    await client.query(
      'UPDATE project_templates SET is_active = false WHERE id = $1',
      [id]
    );

    await client.query('COMMIT');

    req.auditData = { template };

    res.json({ message: 'Template deleted successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error deleting project template:', err);
    res.status(500).json({ error: 'Failed to delete project template' });
  } finally {
    client.release();
  }
});

module.exports = router;

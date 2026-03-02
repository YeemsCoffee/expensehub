const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { auth, requireManager } = require('../middleware/auth');
const { auditLog } = require('../middleware/auditLog');
const db = require('../config/database');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/project-documents');
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename: timestamp-originalname
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB max file size
  },
  fileFilter: (req, file, cb) => {
    // Allow common document types
    const allowedTypes = /pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv|zip|png|jpg|jpeg/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed: PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT, CSV, ZIP, PNG, JPG'));
    }
  }
});

// ============================================================================
// PROJECT DOCUMENTS ROUTES
// ============================================================================

/**
 * GET /api/project-documents/project/:projectId
 * Get all documents for a project
 */
router.get('/project/:projectId', auth, auditLog('VIEW_PROJECT_DOCUMENTS'), async (req, res) => {
  try {
    const { projectId } = req.params;

    const result = await db.query(
      `SELECT pd.*,
              u1.first_name || ' ' || u1.last_name as uploaded_by_name,
              u2.first_name || ' ' || u2.last_name as approved_by_name,
              pp.name as phase_name,
              cr.change_number
       FROM project_documents pd
       LEFT JOIN users u1 ON pd.uploaded_by = u1.id
       LEFT JOIN users u2 ON pd.approved_by = u2.id
       LEFT JOIN project_phases pp ON pd.phase_id = pp.id
       LEFT JOIN project_change_requests cr ON pd.change_request_id = cr.id
       WHERE pd.project_id = $1 AND pd.is_active = true
       ORDER BY pd.uploaded_at DESC`,
      [projectId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching project documents:', err);
    res.status(500).json({ error: 'Failed to fetch project documents' });
  }
});

/**
 * GET /api/project-documents/:id
 * Get a specific document
 */
router.get('/:id', auth, auditLog('VIEW_DOCUMENT'), async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      `SELECT pd.*,
              u1.first_name || ' ' || u1.last_name as uploaded_by_name,
              u2.first_name || ' ' || u2.last_name as approved_by_name,
              pp.name as phase_name,
              cr.change_number
       FROM project_documents pd
       LEFT JOIN users u1 ON pd.uploaded_by = u1.id
       LEFT JOIN users u2 ON pd.approved_by = u2.id
       LEFT JOIN project_phases pp ON pd.phase_id = pp.id
       LEFT JOIN project_change_requests cr ON pd.change_request_id = cr.id
       WHERE pd.id = $1 AND pd.is_active = true`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching document:', err);
    res.status(500).json({ error: 'Failed to fetch document' });
  }
});

/**
 * GET /api/project-documents/:id/versions
 * Get all versions of a document
 */
router.get('/:id/versions', auth, auditLog('VIEW_DOCUMENT_VERSIONS'), async (req, res) => {
  try {
    const { id } = req.params;

    // Get the document to find all related versions
    const docResult = await db.query(
      'SELECT * FROM project_documents WHERE id = $1',
      [id]
    );

    if (docResult.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const document = docResult.rows[0];

    // Find the root document (oldest version)
    let rootId = id;
    let currentDoc = document;
    while (currentDoc.parent_document_id) {
      const parentResult = await db.query(
        'SELECT * FROM project_documents WHERE id = $1',
        [currentDoc.parent_document_id]
      );
      if (parentResult.rows.length === 0) break;
      currentDoc = parentResult.rows[0];
      rootId = currentDoc.id;
    }

    // Get all versions from root
    const versionsResult = await db.query(
      `WITH RECURSIVE doc_versions AS (
         SELECT pd.*, u.first_name || ' ' || u.last_name as uploaded_by_name
         FROM project_documents pd
         LEFT JOIN users u ON pd.uploaded_by = u.id
         WHERE pd.id = $1
         UNION ALL
         SELECT pd.*, u.first_name || ' ' || u.last_name as uploaded_by_name
         FROM project_documents pd
         LEFT JOIN users u ON pd.uploaded_by = u.id
         INNER JOIN doc_versions dv ON pd.parent_document_id = dv.id
       )
       SELECT * FROM doc_versions
       ORDER BY uploaded_at DESC`,
      [rootId]
    );

    res.json(versionsResult.rows);
  } catch (err) {
    console.error('Error fetching document versions:', err);
    res.status(500).json({ error: 'Failed to fetch document versions' });
  }
});

/**
 * POST /api/project-documents/upload
 * Upload a new document
 */
router.post('/upload', auth, upload.single('file'), auditLog('UPLOAD_DOCUMENT'), async (req, res) => {
  const client = await db.pool.connect();
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const {
      project_id,
      phase_id,
      change_request_id,
      document_name,
      document_type,
      document_category,
      version,
      description,
      tags,
      is_confidential,
      requires_approval,
      parent_document_id
    } = req.body;

    // Validation
    if (!project_id) {
      return res.status(400).json({ error: 'Project ID is required' });
    }

    await client.query('BEGIN');

    // If this is a new version, mark previous version as not latest
    if (parent_document_id) {
      await client.query(
        'UPDATE project_documents SET is_latest_version = false WHERE id = $1',
        [parent_document_id]
      );
    }

    // Parse tags if string
    let tagsArray = tags;
    if (typeof tags === 'string') {
      tagsArray = tags.split(',').map(t => t.trim());
    }

    // Insert document record
    const result = await client.query(
      `INSERT INTO project_documents
       (project_id, phase_id, change_request_id, document_name, document_type,
        document_category, version, description, file_path, file_name, file_type,
        file_size, tags, is_confidential, requires_approval, parent_document_id,
        uploaded_by, approval_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       RETURNING *`,
      [
        project_id,
        phase_id || null,
        change_request_id || null,
        document_name || req.file.originalname,
        document_type,
        document_category,
        version || '1.0',
        description,
        req.file.path,
        req.file.filename,
        req.file.mimetype,
        req.file.size,
        tagsArray || [],
        is_confidential === 'true',
        requires_approval === 'true',
        parent_document_id || null,
        req.user.id,
        requires_approval === 'true' ? 'pending_approval' : 'draft'
      ]
    );

    await client.query('COMMIT');

    req.auditData = { document: result.rows[0] };

    res.status(201).json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    // Delete uploaded file if database operation failed
    if (req.file) {
      fs.unlink(req.file.path, (unlinkErr) => {
        if (unlinkErr) console.error('Error deleting file:', unlinkErr);
      });
    }
    console.error('Error uploading document:', err);
    res.status(500).json({ error: 'Failed to upload document' });
  } finally {
    client.release();
  }
});

/**
 * GET /api/project-documents/:id/download
 * Download a document file
 */
router.get('/:id/download', auth, auditLog('DOWNLOAD_DOCUMENT'), async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      'SELECT * FROM project_documents WHERE id = $1 AND is_active = true',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const document = result.rows[0];

    // Check if file exists
    if (!fs.existsSync(document.file_path)) {
      return res.status(404).json({ error: 'File not found on server' });
    }

    // Set headers for download
    res.setHeader('Content-Disposition', `attachment; filename="${document.file_name}"`);
    res.setHeader('Content-Type', document.file_type);

    // Stream the file
    const fileStream = fs.createReadStream(document.file_path);
    fileStream.pipe(res);

    req.auditData = { document_id: id, document_name: document.document_name };
  } catch (err) {
    console.error('Error downloading document:', err);
    res.status(500).json({ error: 'Failed to download document' });
  }
});

/**
 * PUT /api/project-documents/:id
 * Update document metadata
 */
router.put('/:id', auth, auditLog('UPDATE_DOCUMENT'), async (req, res) => {
  const client = await db.pool.connect();
  try {
    const { id } = req.params;
    const {
      document_name,
      description,
      document_category,
      tags,
      is_confidential
    } = req.body;

    await client.query('BEGIN');

    // Get old values
    const oldData = await client.query(
      'SELECT * FROM project_documents WHERE id = $1',
      [id]
    );

    if (oldData.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Document not found' });
    }

    // Parse tags if string
    let tagsArray = tags;
    if (typeof tags === 'string') {
      tagsArray = tags.split(',').map(t => t.trim());
    }

    const result = await client.query(
      `UPDATE project_documents
       SET document_name = COALESCE($1, document_name),
           description = COALESCE($2, description),
           document_category = COALESCE($3, document_category),
           tags = COALESCE($4, tags),
           is_confidential = COALESCE($5, is_confidential),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING *`,
      [document_name, description, document_category, tagsArray, is_confidential, id]
    );

    await client.query('COMMIT');

    req.auditData = {
      oldDocument: oldData.rows[0],
      newDocument: result.rows[0]
    };

    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error updating document:', err);
    res.status(500).json({ error: 'Failed to update document' });
  } finally {
    client.release();
  }
});

/**
 * POST /api/project-documents/:id/approve
 * Approve a document
 */
router.post('/:id/approve', auth, requireManager, auditLog('APPROVE_DOCUMENT'), async (req, res) => {
  const client = await db.pool.connect();
  try {
    const { id } = req.params;

    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE project_documents
       SET approval_status = 'approved',
           approved_by = $1,
           approved_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND requires_approval = true
       RETURNING *`,
      [req.user.id, id]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Document not found or does not require approval' });
    }

    await client.query('COMMIT');

    req.auditData = { document: result.rows[0] };

    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error approving document:', err);
    res.status(500).json({ error: 'Failed to approve document' });
  } finally {
    client.release();
  }
});

/**
 * DELETE /api/project-documents/:id
 * Soft delete a document
 */
router.delete('/:id', auth, requireManager, auditLog('DELETE_DOCUMENT'), async (req, res) => {
  const client = await db.pool.connect();
  try {
    const { id } = req.params;

    await client.query('BEGIN');

    const result = await client.query(
      'UPDATE project_documents SET is_active = false WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Document not found' });
    }

    await client.query('COMMIT');

    req.auditData = { document: result.rows[0] };

    // Note: We don't delete the physical file to maintain audit trail
    // File can be deleted later by a cleanup job

    res.json({ message: 'Document deleted successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error deleting document:', err);
    res.status(500).json({ error: 'Failed to delete document' });
  } finally {
    client.release();
  }
});

module.exports = router;

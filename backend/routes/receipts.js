const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { authMiddleware } = require('../middleware/auth');
const veryfiService = require('../services/veryfiService');
const db = require('../config/database');

// Ensure upload directory exists - use absolute path
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads', 'receipts');
console.log('Upload directory:', uploadDir);

fs.mkdir(uploadDir, { recursive: true })
  .then(() => console.log('Upload directory ready:', uploadDir))
  .catch(err => console.error('Error creating upload directory:', err));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    cb(null, `receipt-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept images and PDFs only
    const allowedTypes = /jpeg|jpg|png|pdf|gif|heic/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('Only images (JPEG, PNG, GIF, HEIC) and PDF files are allowed'));
    }
  }
});

// POST /api/receipts/upload - Upload and process receipt with Veryfi OCR
router.post('/upload', authMiddleware, upload.single('receipt'), async (req, res) => {
  try {
    console.log('Receipt upload request received:', {
      hasFile: !!req.file,
      contentType: req.headers['content-type'],
      bodyKeys: Object.keys(req.body),
      filesKeys: req.files ? Object.keys(req.files) : 'no files object'
    });

    if (!req.file) {
      return res.status(400).json({ error: 'No receipt file uploaded' });
    }

    console.log('Processing receipt upload:', {
      filename: req.file.filename,
      originalname: req.file.originalname,
      path: req.file.path,
      destination: req.file.destination,
      size: req.file.size,
      user: req.user.id
    });

    // Ensure we have the full absolute path
    const filePath = path.isAbsolute(req.file.path)
      ? req.file.path
      : path.join(uploadDir, req.file.filename);

    console.log('Full file path:', filePath);

    // Verify file exists before processing
    try {
      await fs.access(filePath);
      console.log('File exists and is accessible');
    } catch (err) {
      console.error('File not accessible:', err);
      return res.status(500).json({
        error: 'Uploaded file not found',
        details: `File path: ${filePath}`
      });
    }

    // Process with Veryfi
    const result = await veryfiService.processReceipt(
      filePath,
      req.file.originalname
    );

    console.log('Veryfi processing result:', {
      success: result.success,
      hasData: !!result.data,
      veryfiId: result.data?.veryfiId,
      veryfiUrl: result.data?.veryfiUrl
    });

    if (!result.success) {
      // Clean up uploaded file
      await fs.unlink(req.file.path).catch(err => console.error('Error deleting file:', err));

      return res.status(500).json({
        error: 'Failed to process receipt',
        details: result.error
      });
    }

    // Save receipt record to database
    const receiptRecord = await db.query(
      `INSERT INTO expense_receipts (
        user_id, file_name, file_path, file_type, file_size,
        veryfi_id, veryfi_url, ocr_data
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        req.user.id,
        req.file.filename,
        req.file.path,
        req.file.mimetype,
        req.file.size,
        result.data.veryfiId || null,
        result.data.veryfiUrl || null,
        JSON.stringify(result.data)
      ]
    );

    res.json({
      message: 'Receipt processed successfully',
      receiptId: receiptRecord.rows[0].id,
      extractedData: result.data,
      confidence: result.confidence,
      file: {
        filename: req.file.filename,
        size: req.file.size,
        path: req.file.path
      }
    });

  } catch (error) {
    console.error('Receipt upload error:', error);

    // Clean up file if it exists
    if (req.file) {
      await fs.unlink(req.file.path).catch(err => console.error('Error deleting file:', err));
    }

    res.status(500).json({
      error: 'Server error processing receipt',
      details: error.message
    });
  }
});

// POST /api/receipts/process-url - Process receipt from URL
router.post('/process-url', authMiddleware, async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'Receipt URL is required' });
    }

    // Veryfi can process URLs directly
    const result = await veryfiService.client.process_document_url(url);

    if (!result) {
      return res.status(500).json({ error: 'Failed to process receipt from URL' });
    }

    const mappedData = veryfiService.mapVeryfiToExpense(result);

    res.json({
      message: 'Receipt processed successfully',
      extractedData: mappedData,
      veryfiId: result.id
    });

  } catch (error) {
    console.error('Receipt URL processing error:', error);
    res.status(500).json({
      error: 'Server error processing receipt URL',
      details: error.message
    });
  }
});

// GET /api/receipts/:id - Get receipt details
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM expense_receipts
       WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    res.json(result.rows[0]);

  } catch (error) {
    console.error('Get receipt error:', error);
    res.status(500).json({ error: 'Server error fetching receipt' });
  }
});

// GET /api/receipts - Get all receipts for user
router.get('/', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, file_name, file_type, file_size, created_at, veryfi_id
       FROM expense_receipts
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [req.user.id]
    );

    res.json(result.rows);

  } catch (error) {
    console.error('Get receipts error:', error);
    res.status(500).json({ error: 'Server error fetching receipts' });
  }
});

// DELETE /api/receipts/:id - Delete receipt
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    // Get receipt to delete file
    const receipt = await db.query(
      `SELECT * FROM expense_receipts
       WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );

    if (receipt.rows.length === 0) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    // Delete file from disk
    await fs.unlink(receipt.rows[0].file_path).catch(err =>
      console.error('Error deleting file:', err)
    );

    // Delete from Veryfi if veryfi_id exists
    if (receipt.rows[0].veryfi_id) {
      await veryfiService.deleteDocument(receipt.rows[0].veryfi_id);
    }

    // Delete from database
    await db.query(
      'DELETE FROM expense_receipts WHERE id = $1',
      [req.params.id]
    );

    res.json({ message: 'Receipt deleted successfully' });

  } catch (error) {
    console.error('Delete receipt error:', error);
    res.status(500).json({ error: 'Server error deleting receipt' });
  }
});

// POST /api/receipts/:id/re-process - Re-process receipt with Veryfi
router.post('/:id/re-process', authMiddleware, async (req, res) => {
  try {
    const receipt = await db.query(
      `SELECT * FROM expense_receipts
       WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );

    if (receipt.rows.length === 0) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    // Re-process with Veryfi
    const result = await veryfiService.processReceipt(
      receipt.rows[0].file_path,
      receipt.rows[0].file_name
    );

    if (!result.success) {
      return res.status(500).json({
        error: 'Failed to re-process receipt',
        details: result.error
      });
    }

    // Update database with new OCR data
    await db.query(
      `UPDATE expense_receipts
       SET ocr_data = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [JSON.stringify(result.data), req.params.id]
    );

    res.json({
      message: 'Receipt re-processed successfully',
      extractedData: result.data,
      confidence: result.confidence
    });

  } catch (error) {
    console.error('Re-process receipt error:', error);
    res.status(500).json({ error: 'Server error re-processing receipt' });
  }
});

module.exports = router;

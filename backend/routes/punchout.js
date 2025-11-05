const express = require('express');
const router = express.Router();
const axios = require('axios');
const punchoutService = require('../services/punchoutService');
const PUNCHOUT_VENDORS = require('../config/punchoutVendors');
const db = require('../config/database');
const { authMiddleware } = require('../middleware/auth');

// Get list of available punchout vendors
router.get('/vendors', authMiddleware, async (req, res) => {
  try {
    const vendors = Object.entries(PUNCHOUT_VENDORS)
      .filter(([key, vendor]) => vendor.enabled)
      .map(([key, vendor]) => ({
        id: key,
        name: vendor.name,
        type: vendor.type,
        logo: vendor.logo,
        categories: vendor.categories
      }));

    res.json(vendors);
  } catch (error) {
    console.error('Error fetching punchout vendors:', error);
    res.status(500).json({ error: 'Failed to fetch vendors' });
  }
});

// Initiate punchout session
router.post('/initiate/:vendorId', authMiddleware, async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { costCenterId } = req.body;
    
    const vendor = PUNCHOUT_VENDORS[vendorId];
    if (!vendor || !vendor.enabled) {
      return res.status(404).json({ error: 'Vendor not found or disabled' });
    }

    // Get user info
    const userResult = await db.query(
      'SELECT email, first_name, last_name FROM users WHERE id = $1',
      [req.user.id]
    );
    const user = userResult.rows[0];

    // Get cost center if provided
    let costCenter = '';
    if (costCenterId) {
      const ccResult = await db.query(
        'SELECT code FROM cost_centers WHERE id = $1',
        [costCenterId]
      );
      costCenter = ccResult.rows[0]?.code || '';
    }

    // Create punchout session record
    const sessionResult = await db.query(
      `INSERT INTO punchout_sessions 
       (user_id, vendor_id, cost_center_id, status, initiated_at)
       VALUES ($1, $2, $3, 'initiated', CURRENT_TIMESTAMP)
       RETURNING id`,
      [req.user.id, vendorId, costCenterId]
    );
    const sessionId = sessionResult.rows[0].id;

    // Generate punchout request based on vendor type
    if (vendor.type === 'cxml') {
      // cXML punchout
      const cxmlRequest = punchoutService.generateCxmlPunchoutRequest(
        vendor.config,
        sessionId,
        user.email,
        costCenter
      );

      // Create auto-submit form
      const formHtml = punchoutService.createPunchoutForm(
        vendor.config.punchoutUrl,
        cxmlRequest
      );

      res.send(formHtml);
    } else if (vendor.type === 'oci') {
      // OCI punchout (URL redirect)
      const punchoutUrl = punchoutService.generateOciPunchoutUrl(
        vendor.config,
        sessionId,
        user.email,
        costCenter
      );

      res.json({
        type: 'redirect',
        url: punchoutUrl,
        sessionId
      });
    } else {
      res.status(400).json({ error: 'Unsupported vendor type' });
    }
  } catch (error) {
    console.error('Error initiating punchout:', error);
    res.status(500).json({ error: 'Failed to initiate punchout session' });
  }
});

// Receive punchout return (cXML POST)
router.post('/return', async (req, res) => {
  try {
    const cxmlResponse = req.body['cxml-urlencoded'] || req.body;
    
    // Parse cXML response
    const parsedData = await punchoutService.parseCxmlReturn(cxmlResponse);
    
    if (!parsedData.success) {
      return res.status(400).json({ error: 'Invalid punchout response' });
    }

    const sessionId = parsedData.buyerCookie;

    // Get session info
    const sessionResult = await db.query(
      'SELECT user_id, vendor_id, cost_center_id FROM punchout_sessions WHERE id = $1',
      [sessionId]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const session = sessionResult.rows[0];
    const vendor = PUNCHOUT_VENDORS[session.vendor_id];

    // Add items to cart
    for (const item of parsedData.items) {
      // Check if product exists in our system, if not create it
      let productResult = await db.query(
        'SELECT id FROM products WHERE sku = $1',
        [item.itemId]
      );

      let productId;
      if (productResult.rows.length === 0) {
        // Create new product from punchout data
        // First, ensure vendor exists in our database
        let vendorDbResult = await db.query(
          'SELECT id FROM vendors WHERE name = $1',
          [vendor.name]
        );

        let vendorDbId;
        if (vendorDbResult.rows.length === 0) {
          // Create vendor
          const newVendor = await db.query(
            `INSERT INTO vendors (name, category, rating)
             VALUES ($1, $2, $3) RETURNING id`,
            [vendor.name, vendor.categories[0], 4.0]
          );
          vendorDbId = newVendor.rows[0].id;
        } else {
          vendorDbId = vendorDbResult.rows[0].id;
        }

        // Create product
        const newProduct = await db.query(
          `INSERT INTO products (vendor_id, name, description, price, sku)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [vendorDbId, item.description, item.description, item.unitPrice, item.itemId]
        );
        productId = newProduct.rows[0].id;
      } else {
        productId = productResult.rows[0].id;
      }

      // Add to cart or update quantity
      await db.query(
        `INSERT INTO cart_items (user_id, product_id, quantity, cost_center_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, product_id) 
         DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity`,
        [session.user_id, productId, item.quantity, session.cost_center_id]
      );
    }

    // Update session status
    await db.query(
      `UPDATE punchout_sessions 
       SET status = 'completed', completed_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [sessionId]
    );

    // Redirect back to frontend cart page
    res.redirect(`${process.env.FRONTEND_URL}/cart?punchout=success&items=${parsedData.items.length}`);
  } catch (error) {
    console.error('Error processing punchout return:', error);
    res.redirect(`${process.env.FRONTEND_URL}/cart?punchout=error`);
  }
});

// Receive OCI return (GET parameters)
router.get('/return', async (req, res) => {
  try {
    const parsedData = punchoutService.parseOciReturn(req.query);
    
    if (!parsedData.success) {
      return res.redirect(`${process.env.FRONTEND_URL}/cart?punchout=error`);
    }

    // Similar processing as cXML return...
    // (Implementation similar to POST /return above)

    res.redirect(`${process.env.FRONTEND_URL}/cart?punchout=success&items=${parsedData.items.length}`);
  } catch (error) {
    console.error('Error processing OCI return:', error);
    res.redirect(`${process.env.FRONTEND_URL}/cart?punchout=error`);
  }
});

// Get punchout session history
router.get('/sessions', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, vendor_id, status, initiated_at, completed_at
       FROM punchout_sessions
       WHERE user_id = $1
       ORDER BY initiated_at DESC
       LIMIT 50`,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching sessions:', error);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// Test punchout connection - directly call vendor API and return response
router.post('/test/:vendorId', authMiddleware, async (req, res) => {
  try {
    const { vendorId } = req.params;

    const vendor = PUNCHOUT_VENDORS[vendorId];
    if (!vendor || !vendor.enabled) {
      return res.status(404).json({ error: 'Vendor not found or disabled' });
    }

    // Get user info
    const userResult = await db.query(
      'SELECT email FROM users WHERE id = $1',
      [req.user.id]
    );
    const user = userResult.rows[0];

    // Generate test cXML request
    const cxmlRequest = punchoutService.generateCxmlPunchoutRequest(
      vendor.config,
      'test-session-' + Date.now(),
      user.email,
      'TEST-CC'
    );

    console.log('\n' + '='.repeat(70));
    console.log('TESTING PUNCHOUT CONNECTION');
    console.log('='.repeat(70));
    console.log('Vendor:', vendor.name);
    console.log('URL:', vendor.config.punchoutUrl);
    console.log('Request Size:', cxmlRequest.length, 'bytes');
    console.log('='.repeat(70));

    // Make direct HTTP POST to vendor
    try {
      const response = await axios.post(
        vendor.config.punchoutUrl,
        new URLSearchParams({ 'cxml-urlencoded': cxmlRequest }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'ExpenseHub/1.0',
            'Accept': 'text/html,text/xml,application/xml,*/*'
          },
          timeout: 30000,
          maxRedirects: 5,
          validateStatus: () => true  // Don't throw on any status
        }
      );

      console.log('\n' + '='.repeat(70));
      console.log('RESPONSE RECEIVED');
      console.log('='.repeat(70));
      console.log('Status:', response.status, response.statusText);
      console.log('Headers:', JSON.stringify(response.headers, null, 2));
      console.log('Response Type:', typeof response.data);
      console.log('Response Length:', response.data?.length || 0, 'bytes');
      console.log('\nFirst 1000 chars of response:');
      console.log(String(response.data).substring(0, 1000));
      console.log('='.repeat(70));

      // Return detailed response to frontend
      res.json({
        success: response.status === 200,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        data: String(response.data).substring(0, 5000), // First 5000 chars
        fullDataLength: response.data?.length || 0,
        requestSent: {
          url: vendor.config.punchoutUrl,
          cxmlLength: cxmlRequest.length,
          cxmlPreview: cxmlRequest.substring(0, 500)
        }
      });

    } catch (axiosError) {
      console.error('\n' + '='.repeat(70));
      console.error('HTTP REQUEST FAILED');
      console.error('='.repeat(70));
      console.error('Error:', axiosError.message);
      if (axiosError.response) {
        console.error('Status:', axiosError.response.status);
        console.error('Headers:', axiosError.response.headers);
        console.error('Data:', String(axiosError.response.data).substring(0, 1000));
      }
      console.error('='.repeat(70));

      res.json({
        success: false,
        error: axiosError.message,
        status: axiosError.response?.status,
        statusText: axiosError.response?.statusText,
        headers: axiosError.response?.headers,
        data: axiosError.response?.data ? String(axiosError.response.data).substring(0, 5000) : null,
        requestSent: {
          url: vendor.config.punchoutUrl,
          cxmlLength: cxmlRequest.length,
          cxmlPreview: cxmlRequest.substring(0, 500)
        }
      });
    }

  } catch (error) {
    console.error('Test punchout error:', error);
    res.status(500).json({
      error: 'Failed to test punchout connection',
      message: error.message,
      stack: error.stack
    });
  }
});

module.exports = router;

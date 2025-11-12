const express = require('express');
const router = express.Router();
const axios = require('axios');
const { XMLParser } = require('fast-xml-parser');
const crypto = require('crypto');
const db = require('../config/database');
const { authMiddleware } = require('../middleware/auth');

// Amazon Punchout Configuration
const AMAZON_CONFIG = {
  identity: process.env.AMAZON_PUNCHOUT_IDENTITY || 'PunchoutGroup1556947794',
  sharedSecret: process.env.AMAZON_PUNCHOUT_SECRET || 'pVn9bQwGGnl1KZ26VyblJJoXFJCXV2',
  punchoutUrl: process.env.AMAZON_PUNCHOUT_URL || 'https://abintegrations.amazon.com/punchout',
  testUrl: process.env.AMAZON_PUNCHOUT_TEST_URL || 'https://abintegrations.amazon.com/punchout/test',
  poUrl: process.env.AMAZON_PO_URL || 'https://https-ats.amazonsedi.com/2e947cf5-c06d-4411-bffd-57839c057856',
  useProd: process.env.AMAZON_PUNCHOUT_USE_PROD === 'true'
};

// Helper function to build cXML PunchOutSetupRequest
function buildPunchOutSetupRequest(userId, userEmail, userName, buyerCookie) {
  const timestamp = new Date().toISOString();
  const payloadId = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE cXML SYSTEM "http://xml.cxml.org/schemas/cXML/1.2.014/cXML.dtd">
<cXML payloadID="${payloadId}" timestamp="${timestamp}" xml:lang="en-US">
  <Header>
    <From>
      <Credential domain="NetworkId">
        <Identity>${AMAZON_CONFIG.identity}</Identity>
      </Credential>
    </From>
    <To>
      <Credential domain="NetworkId">
        <Identity>Amazon</Identity>
      </Credential>
    </To>
    <Sender>
      <Credential domain="NetworkId">
        <Identity>${AMAZON_CONFIG.identity}</Identity>
        <SharedSecret>${AMAZON_CONFIG.sharedSecret}</SharedSecret>
      </Credential>
      <UserAgent>ExpenseHub 1.0</UserAgent>
    </Sender>
  </Header>
  <Request deploymentMode="${AMAZON_CONFIG.useProd ? 'production' : 'test'}">
    <PunchOutSetupRequest operation="create">
      <BuyerCookie>${buyerCookie}</BuyerCookie>
      <Extrinsic name="User">${userEmail}</Extrinsic>
      <Extrinsic name="UserEmail">${userEmail}</Extrinsic>
      <BrowserFormPost>
        <URL>${process.env.FRONTEND_URL || 'http://localhost:3000'}/api/amazon-punchout/return</URL>
      </BrowserFormPost>
      <Contact role="buyer">
        <Name xml:lang="en-US">${userName}</Name>
        <Email>${userEmail}</Email>
      </Contact>
      <SupplierSetup>
        <URL>${AMAZON_CONFIG.useProd ? AMAZON_CONFIG.punchoutUrl : AMAZON_CONFIG.testUrl}</URL>
      </SupplierSetup>
    </PunchOutSetupRequest>
  </Request>
</cXML>`;
}

// Helper function to parse cXML response using fast-xml-parser
function parseCxmlResponse(xmlString) {
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_'
    });
    const result = parser.parse(xmlString);
    return result;
  } catch (error) {
    throw new Error(`Failed to parse cXML: ${error.message}`);
  }
}

// Initiate Amazon Punchout Session
router.post('/setup', authMiddleware, async (req, res) => {
  try {
    const { costCenterId } = req.body;

    console.log('Amazon Punchout setup request:', {
      userId: req.user.id,
      userEmail: req.user.email,
      costCenterId
    });

    // Validate user has access to cost center
    if (costCenterId) {
      const ccCheck = await db.query(
        'SELECT id FROM cost_centers WHERE id = $1',
        [costCenterId]
      );

      if (ccCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Cost center not found' });
      }
    }

    // Create a punchout session in database
    const sessionResult = await db.query(
      `INSERT INTO punchout_sessions (
        user_id,
        vendor_id,
        cost_center_id,
        vendor_name,
        status,
        buyer_cookie
      ) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, buyer_cookie`,
      [
        req.user.id,
        '1', // Amazon Business vendor ID
        costCenterId,
        'Amazon Business',
        'initiated',
        crypto.randomBytes(16).toString('hex')
      ]
    );

    const session = sessionResult.rows[0];
    const buyerCookie = session.buyer_cookie;

    console.log('Created punchout session:', session.id, 'with cookie:', buyerCookie);

    // Build cXML request
    const cxmlRequest = buildPunchOutSetupRequest(
      req.user.id,
      req.user.email,
      req.user.name || req.user.email,
      buyerCookie
    );

    console.log('Generated cXML (first 500 chars):', cxmlRequest.substring(0, 500));

    // Store the request for debugging
    await db.query(
      `UPDATE punchout_sessions
       SET request_xml = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [cxmlRequest, session.id]
    );

    // SERVER-SIDE POST to Amazon with proper form encoding
    const targetUrl = AMAZON_CONFIG.useProd ? AMAZON_CONFIG.punchoutUrl : AMAZON_CONFIG.testUrl;

    // Use URLSearchParams for proper form encoding
    const params = new URLSearchParams();
    params.append('cxml-urlencoded', cxmlRequest);

    console.log('Posting to Amazon:', targetUrl);

    const { data: responseBody, status } = await axios.post(
      targetUrl,
      params.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'text/xml,application/xml'
        },
        maxRedirects: 0,
        validateStatus: (status) => status >= 200 && status < 400
      }
    );

    console.log('Amazon response status:', status);
    console.log('Amazon response (first 500 chars):', responseBody.substring(0, 500));

    // Parse cXML response to extract StartPage URL
    const parsed = parseCxmlResponse(responseBody);

    // Try multiple paths to find the StartPage URL
    const startUrl =
      parsed?.cXML?.Response?.PunchOutSetupResponse?.StartPage?.URL ||
      parsed?.cXML?.Message?.PunchOutSetupResponse?.StartPage?.URL;

    if (!startUrl) {
      console.error('No StartPage URL found in Amazon response');
      console.error('Parsed response:', JSON.stringify(parsed, null, 2));

      return res.status(502).json({
        error: 'No StartPage URL found in Amazon response',
        hint: 'Check credentials, domains, or body format',
        amazonResponse: responseBody.substring(0, 1000),
        status
      });
    }

    console.log('Amazon StartPage URL:', startUrl);

    // Return the StartPage URL to the frontend for redirect
    res.json({
      sessionId: session.id,
      startUrl,
      success: true
    });

  } catch (error) {
    console.error('Amazon Punchout setup error:', error.message);
    console.error('Error stack:', error.stack);

    const amazonBody = error?.response?.data;
    const amazonStatus = error?.response?.status;

    res.status(500).json({
      error: 'Failed to setup punchout session',
      details: error.message,
      amazonStatus,
      amazonBody: typeof amazonBody === 'string' ? amazonBody.substring(0, 1000) : undefined
    });
  }
});

// Handle Amazon Punchout Return (BrowserFormPost callback)
router.post('/return', express.text({ type: '*/*' }), async (req, res) => {
  try {
    console.log('Received punchout return data');

    // Parse the cXML response
    const cxmlResponse = typeof req.body === 'string' ? req.body : req.body.cxml || req.body;
    const parsedXml = parseCxmlResponse(cxmlResponse);

    // Extract BuyerCookie and items
    const buyerCookie = parsedXml.cXML?.Message?.PunchOutOrderMessage?.BuyerCookie;

    if (!buyerCookie) {
      console.error('No BuyerCookie found in response');
      return res.status(400).send('Invalid punchout response: missing BuyerCookie');
    }

    // Find the session
    const sessionResult = await db.query(
      `SELECT id, user_id, cost_center_id
       FROM punchout_sessions
       WHERE buyer_cookie = $1`,
      [buyerCookie]
    );

    if (sessionResult.rows.length === 0) {
      console.error('Session not found for cookie:', buyerCookie);
      return res.status(404).send('Punchout session not found');
    }

    const session = sessionResult.rows[0];

    // Extract line items from the order
    const itemsIn = parsedXml.cXML?.Message?.PunchOutOrderMessage?.ItemIn;
    const items = Array.isArray(itemsIn) ? itemsIn : [itemsIn];

    // Store response XML
    await db.query(
      `UPDATE punchout_sessions
       SET response_xml = $1, status = 'completed', updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [cxmlResponse, session.id]
    );

    // Process items and add to cart or create as pending expenses
    for (const item of items) {
      if (!item) continue;

      const quantity = parseInt(item['@_quantity']) || 1;
      const unitPrice = parseFloat(item.ItemDetail?.UnitPrice?.Money?.['#text'] || item.ItemDetail?.UnitPrice?.Money) || 0;
      const description = item.ItemDetail?.Description?.['#text'] || item.ItemDetail?.Description || 'Amazon Business Item';
      const supplierPartId = item.ItemDetail?.SupplierPartID || '';
      const manufacturerPartId = item.ItemDetail?.ManufacturerPartID || '';

      // Create a product entry for this Amazon item
      const productResult = await db.query(
        `INSERT INTO products (
          vendor_id,
          name,
          description,
          price,
          sku,
          is_active
        ) VALUES (
          (SELECT id FROM vendors WHERE name = 'Amazon Business' LIMIT 1),
          $1,
          $2,
          $3,
          $4,
          true
        ) ON CONFLICT (sku) DO UPDATE SET
          price = EXCLUDED.price,
          description = EXCLUDED.description
        RETURNING id`,
        [
          description.substring(0, 200),
          description,
          unitPrice,
          supplierPartId || manufacturerPartId || `AMAZON-${Date.now()}`
        ]
      );

      const productId = productResult.rows[0].id;

      // Add to cart
      await db.query(
        `INSERT INTO cart_items (user_id, product_id, quantity, cost_center_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, product_id) DO UPDATE SET
           quantity = cart_items.quantity + EXCLUDED.quantity,
           updated_at = CURRENT_TIMESTAMP`,
        [session.user_id, productId, quantity, session.cost_center_id]
      );
    }

    // Redirect back to the application
    const redirectUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/cart?punchout_success=true`;

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Returning to ExpenseHub</title>
        <meta http-equiv="refresh" content="0;url=${redirectUrl}">
      </head>
      <body>
        <p>Processing your order... You will be redirected shortly.</p>
        <script>
          window.location.href = '${redirectUrl}';
        </script>
      </body>
      </html>
    `);

  } catch (error) {
    console.error('Punchout return error:', error);
    res.status(500).send('Error processing punchout return');
  }
});

// Get punchout session details
router.get('/session/:sessionId', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, user_id, vendor_name, status, buyer_cookie, created_at, updated_at
       FROM punchout_sessions
       WHERE id = $1 AND user_id = $2`,
      [req.params.sessionId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Fetch session error:', error);
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

// Get user's punchout history
router.get('/history', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, vendor_name, status, created_at, updated_at
       FROM punchout_sessions
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Fetch history error:', error);
    res.status(500).json({ error: 'Failed to fetch punchout history' });
  }
});

// Debug endpoint to view generated cXML
router.get('/debug/cxml', authMiddleware, async (req, res) => {
  try {
    const buyerCookie = 'debug-cookie-' + Date.now();
    const cxmlRequest = buildPunchOutSetupRequest(
      req.user.id,
      req.user.email,
      req.user.name || req.user.email,
      buyerCookie
    );

    res.set('Content-Type', 'text/xml');
    res.send(cxmlRequest);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

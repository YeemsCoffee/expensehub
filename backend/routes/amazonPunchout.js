const express = require('express');
const router = express.Router();
const axios = require('axios');
const { XMLParser } = require('fast-xml-parser');
const crypto = require('crypto');
const db = require('../config/database');
const { authMiddleware } = require('../middleware/auth');

// Amazon Punchout Configuration
const AMAZON_CONFIG = {
  identity: process.env.AMAZON_PUNCHOUT_IDENTITY,
  sharedSecret: process.env.AMAZON_PUNCHOUT_SECRET,
  punchoutUrl: process.env.AMAZON_PUNCHOUT_URL || 'https://abintegrations.amazon.com/punchout',
  testUrl: process.env.AMAZON_PUNCHOUT_TEST_URL || 'https://abintegrations.amazon.com/punchout/test',
  poUrl: process.env.AMAZON_PO_URL || 'https://https-ats.amazonsedi.com/2e947cf5-c06d-4411-bffd-57839c057856',
  useProd: process.env.AMAZON_PUNCHOUT_USE_PROD === 'true'
};

function ensureAmazonConfig() {
  if (!AMAZON_CONFIG.identity || !AMAZON_CONFIG.sharedSecret) {
    throw new Error('Amazon Punchout credentials are not configured');
  }
}

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
      <BrowserFormPost>
        <URL>${process.env.BACKEND_URL || 'http://localhost:5000'}/api/amazon-punchout/return</URL>
      </BrowserFormPost>
      <SupplierSetup>
        <URL>${AMAZON_CONFIG.useProd ? AMAZON_CONFIG.punchoutUrl : AMAZON_CONFIG.testUrl}</URL>
      </SupplierSetup>
      <Extrinsic name="UserEmail">${userEmail}</Extrinsic>
      <Contact role="buyer">
        <Name xml:lang="en-US">${userName}</Name>
        <Email>${userEmail}</Email>
      </Contact>
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
    ensureAmazonConfig();
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

    // SERVER-SIDE POST to Amazon with text/xml Content-Type
    // Note: PunchOutSetupRequest uses text/xml (not form-urlencoded)
    // Only PunchOutOrderMessage (return cart) uses form-urlencoded
    const targetUrl = AMAZON_CONFIG.useProd ? AMAZON_CONFIG.punchoutUrl : AMAZON_CONFIG.testUrl;

    console.log('=== AMAZON PUNCHOUT REQUEST DEBUG ===');
    console.log('Environment Mode:', AMAZON_CONFIG.useProd ? 'PRODUCTION' : 'TEST');
    console.log('Target URL:', targetUrl);
    console.log('cXML Request (first 1000 chars):', cxmlRequest.substring(0, 1000));
    console.log('Content-Type:', 'text/xml; charset=UTF-8');
    console.log('=== END REQUEST DEBUG ===');

    const { data: responseBody, status } = await axios.post(
      targetUrl,
      cxmlRequest,
      {
        headers: {
          'Content-Type': 'text/xml; charset=UTF-8',
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

    // Log complete error response details
    console.error('=== FULL ERROR RESPONSE DEBUG ===');
    console.error('Has error.response?', !!error.response);
    console.error('Status:', error?.response?.status);
    console.error('Status Text:', error?.response?.statusText);
    console.error('Headers:', JSON.stringify(error?.response?.headers || {}));
    console.error('Data Type:', typeof error?.response?.data);
    console.error('Data:', error?.response?.data);

    if (error?.response?.data) {
      if (typeof error.response.data === 'string') {
        console.error('Amazon Error Response (full):', error.response.data);
      } else if (typeof error.response.data === 'object') {
        console.error('Amazon Error Response (JSON):', JSON.stringify(error.response.data, null, 2));
      }
    } else {
      console.error('No response data available in error object');
    }
    console.error('=== END ERROR DEBUG ===');

    const amazonBody = error?.response?.data;
    const amazonStatus = error?.response?.status;

    // Log Amazon's actual error response for debugging
    if (amazonBody) {
      console.error('Amazon error response body:', amazonBody);
      console.error('Amazon error response type:', typeof amazonBody);
    }

    res.status(500).json({
      error: 'Failed to setup punchout session',
      details: error.message,
      amazonStatus,
      amazonBody: typeof amazonBody === 'string' ? amazonBody.substring(0, 1000) : undefined
    });
  }
});

// Handle Amazon Punchout Return (BrowserFormPost callback)
// Note: Amazon sends form-urlencoded with parameter 'cxml-urlencoded'
router.post('/return', async (req, res) => {
  try {
    console.log('Received punchout return data');
    console.log('Request body type:', typeof req.body);
    console.log('Request body (first 1000 chars):', JSON.stringify(req.body).substring(0, 1000));
    console.log('Request headers:', JSON.stringify(req.headers));

    // Parse the cXML response
    // Amazon sends it as form parameter 'cxml-urlencoded' (lowercase)
    const cxmlResponse = typeof req.body === 'string'
      ? req.body
      : req.body['cxml-urlencoded'] || req.body.cxml || req.body;
    console.log('cxmlResponse type:', typeof cxmlResponse);
    console.log('cxmlResponse (first 500 chars):', String(cxmlResponse).substring(0, 500));

    const parsedXml = parseCxmlResponse(cxmlResponse);
    console.log('Parsed XML structure:', JSON.stringify(parsedXml, null, 2).substring(0, 1000));

    // Extract BuyerCookie and items
    const buyerCookie = parsedXml.cXML?.Message?.PunchOutOrderMessage?.BuyerCookie;
    console.log('Extracted BuyerCookie:', buyerCookie);

    if (!buyerCookie) {
      console.error('No BuyerCookie found in response');
      console.error('Full parsed XML:', JSON.stringify(parsedXml, null, 2));
      return res.status(400).send('Invalid punchout response: missing BuyerCookie');
    }

    console.log('Looking up session for BuyerCookie:', buyerCookie);

    // Find the session
    const sessionResult = await db.query(
      `SELECT id, user_id, cost_center_id
       FROM punchout_sessions
       WHERE buyer_cookie = $1`,
      [buyerCookie]
    );

    console.log('Session query result:', sessionResult.rows.length, 'rows found');

    if (sessionResult.rows.length === 0) {
      console.error('Session not found for cookie:', buyerCookie);
      return res.status(404).send('Punchout session not found');
    }

    const session = sessionResult.rows[0];
    console.log('Found session:', session.id, 'for user:', session.user_id);

    // Extract line items from the order
    const itemsIn = parsedXml.cXML?.Message?.PunchOutOrderMessage?.ItemIn;
    const items = Array.isArray(itemsIn) ? itemsIn : [itemsIn];
    console.log('Extracted items count:', items.length);

    // Store response XML
    console.log('Updating session with response XML...');
    await db.query(
      `UPDATE punchout_sessions
       SET response_xml = $1, status = 'completed', updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [cxmlResponse, session.id]
    );
    console.log('Session updated successfully');

    // Process items and add to cart or create as pending expenses
    console.log('Processing items and adding to cart...');
    for (const item of items) {
      if (!item) continue;

      const quantity = parseInt(item['@_quantity']) || 1;
      const unitPrice = parseFloat(item.ItemDetail?.UnitPrice?.Money?.['#text'] || item.ItemDetail?.UnitPrice?.Money) || 0;
      const description = item.ItemDetail?.Description?.['#text'] || item.ItemDetail?.Description || 'Amazon Business Item';
      const supplierPartId = item.ItemID?.SupplierPartID || '';
      const manufacturerPartId = item.ItemDetail?.ManufacturerPartID || '';

      // CRITICAL: Capture SupplierPartAuxiliaryID (Amazon cart/session ID)
      // This is required to place orders with Amazon after approval
      // NOTE: SupplierPartAuxiliaryID is under ItemID, not ItemDetail!
      const supplierPartAuxiliaryID = item.ItemID?.SupplierPartAuxiliaryID || '';

      console.log('Processing item:', {description, quantity, unitPrice, supplierPartId, supplierPartAuxiliaryID});

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
      console.log('Created/updated product with ID:', productId);

      // Add to cart with Amazon SPAID for order placement
      await db.query(
        `INSERT INTO cart_items (user_id, product_id, quantity, cost_center_id, amazon_spaid)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, product_id) DO UPDATE SET
           quantity = cart_items.quantity + EXCLUDED.quantity,
           amazon_spaid = EXCLUDED.amazon_spaid,
           updated_at = CURRENT_TIMESTAMP`,
        [session.user_id, productId, quantity, session.cost_center_id, supplierPartAuxiliaryID]
      );
      console.log('Added item to cart for user:', session.user_id, 'with SPAID:', supplierPartAuxiliaryID);
    }

    console.log('All items processed successfully');

    // Redirect back to the application
    const redirectUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/cart?punchout_success=true`;
    console.log('Redirecting to:', redirectUrl);

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
    ensureAmazonConfig();
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

// Helper function to build cXML OrderRequest for Amazon
function buildOrderRequest(expense, userEmail, userName, poNumber, location) {
  const timestamp = new Date().toISOString();
  const payloadId = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;

  // Extract Amazon SPAID (format: "session-id,line-number")
  const amazonSpaid = expense.amazon_spaid;

  // Use location address if provided, otherwise fall back to env defaults
  const shipStreet = location?.address || process.env.COMPANY_SHIP_STREET || '123 Main Street';
  const shipCity = location?.city || process.env.COMPANY_SHIP_CITY || 'Seattle';
  const shipState = location?.state || process.env.COMPANY_SHIP_STATE || 'WA';
  const shipZip = location?.zip_code || process.env.COMPANY_SHIP_ZIP || '98101';

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
    <OrderRequest>
      <OrderRequestHeader orderID="${poNumber}" orderDate="${expense.date}" type="new">
        <Total>
          <Money currency="USD">${expense.amount}</Money>
        </Total>
        <ShipTo>
          <Address>
            <Name xml:lang="en">${location?.name || userName}</Name>
            <PostalAddress>
              <Street>${shipStreet}</Street>
              <City>${shipCity}</City>
              <State>${shipState}</State>
              <PostalCode>${shipZip}</PostalCode>
              <Country isoCountryCode="US">United States</Country>
            </PostalAddress>
          </Address>
        </ShipTo>
        <BillTo>
          <Address addressID="${AMAZON_CONFIG.identity}">
            <Name xml:lang="en">ExpenseHub</Name>
          </Address>
        </BillTo>
        <Contact role="buyer">
          <Name xml:lang="en">${userName}</Name>
          <Email>${userEmail}</Email>
        </Contact>
      </OrderRequestHeader>
      <ItemOut quantity="${expense.quantity || 1}" lineNumber="1">
        <ItemID>
          <SupplierPartID>${expense.description}</SupplierPartID>
          <SupplierPartAuxiliaryID>${amazonSpaid}</SupplierPartAuxiliaryID>
        </ItemID>
        <ItemDetail>
          <UnitPrice>
            <Money currency="USD">${expense.amount}</Money>
          </UnitPrice>
          <Description xml:lang="en">${expense.description}|${amazonSpaid}</Description>
        </ItemDetail>
      </ItemOut>
    </OrderRequest>
  </Request>
</cXML>`;
}

// Function to send OrderRequest to Amazon PO URL
async function sendOrderToAmazon(expense, userInfo) {
  try {
    ensureAmazonConfig();

    if (!expense.amazon_spaid) {
      throw new Error('Missing Amazon SPAID - cannot place order');
    }

    // Generate internal PO number
    const poNumber = `PO-${Date.now()}-${expense.id}`;

    // Build cXML OrderRequest
    const orderRequest = buildOrderRequest(
      expense,
      userInfo.email,
      userInfo.name,
      poNumber,
      userInfo.location
    );

    console.log('=== AMAZON ORDER REQUEST DEBUG ===');
    console.log('Expense ID:', expense.id);
    console.log('Amazon SPAID:', expense.amazon_spaid);
    console.log('PO Number:', poNumber);
    console.log('Target URL:', AMAZON_CONFIG.poUrl);
    console.log('Order Request (first 1000 chars):', orderRequest.substring(0, 1000));
    console.log('=== END DEBUG ===');

    // Send OrderRequest to Amazon PO URL
    const response = await axios.post(
      AMAZON_CONFIG.poUrl,
      orderRequest,
      {
        headers: {
          'Content-Type': 'text/xml; charset=UTF-8',
          'Accept': 'text/xml,application/xml'
        },
        validateStatus: (status) => status >= 200 && status < 400
      }
    );

    console.log('Amazon PO response status:', response.status);
    console.log('Amazon PO response (first 500 chars):', response.data.substring(0, 500));

    // Parse response to extract confirmation
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_'
    });
    const parsed = parser.parse(response.data);

    // Extract order confirmation number if available
    const orderStatus = parsed?.cXML?.Response?.Status?.['@_code'];
    const orderMessage = parsed?.cXML?.Response?.Status?.['@_text'];

    return {
      success: orderStatus === '200',
      poNumber: poNumber,
      amazonResponse: response.data,
      orderStatus: orderStatus,
      orderMessage: orderMessage
    };

  } catch (error) {
    console.error('Amazon order placement error:', error.message);
    console.error('Error response:', error.response?.data);

    return {
      success: false,
      error: error.message,
      amazonResponse: error.response?.data
    };
  }
}

// Export the sendOrderToAmazon function for use in expense approval
module.exports = router;
module.exports.sendOrderToAmazon = sendOrderToAmazon;

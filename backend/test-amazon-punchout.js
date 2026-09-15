// Standalone check that Amazon accepts our PunchOutSetupRequest.
// Usage (from backend/): node test-amazon-punchout.js
// Credentials come from .env; nothing is hardcoded here.
require('dotenv').config();
const axios = require('axios');
const crypto = require('crypto');

const AMAZON_CONFIG = {
  identity: process.env.AMAZON_PUNCHOUT_IDENTITY,
  sharedSecret: process.env.AMAZON_PUNCHOUT_SECRET,
  testUrl: process.env.AMAZON_PUNCHOUT_TEST_URL || 'https://abintegrations.amazon.com/punchout/test',
  returnUrl: process.env.BACKEND_URL || 'http://localhost:5000',
  testEmail: process.env.AMAZON_PUNCHOUT_TEST_EMAIL || 'test@example.com'
};

if (!AMAZON_CONFIG.identity || !AMAZON_CONFIG.sharedSecret) {
  console.error('Set AMAZON_PUNCHOUT_IDENTITY and AMAZON_PUNCHOUT_SECRET in backend/.env first.');
  process.exit(1);
}

function redact(xml) {
  return xml.replace(/<SharedSecret>[\s\S]*?<\/SharedSecret>/g, '<SharedSecret>[REDACTED]</SharedSecret>');
}

function buildTestCXML() {
  const timestamp = new Date().toISOString();
  const payloadId = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
  const buyerCookie = crypto.randomBytes(16).toString('hex');

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
  <Request deploymentMode="test">
    <PunchOutSetupRequest operation="create">
      <BuyerCookie>${buyerCookie}</BuyerCookie>
      <BrowserFormPost>
        <URL>${AMAZON_CONFIG.returnUrl}/api/amazon-punchout/return</URL>
      </BrowserFormPost>
      <SupplierSetup>
        <URL>${AMAZON_CONFIG.testUrl}</URL>
      </SupplierSetup>
      <Extrinsic name="UserEmail">${AMAZON_CONFIG.testEmail}</Extrinsic>
      <Contact role="buyer">
        <Name xml:lang="en-US">Test User</Name>
        <Email>${AMAZON_CONFIG.testEmail}</Email>
      </Contact>
    </PunchOutSetupRequest>
  </Request>
</cXML>`;
}

async function testAmazonPunchout() {
  const cxmlRequest = buildTestCXML();

  console.log('=== TESTING AMAZON PUNCHOUT ===');
  console.log('Target URL:', AMAZON_CONFIG.testUrl);
  console.log('Content-Type: text/xml; charset=UTF-8');
  console.log('\ncXML Request:\n', redact(cxmlRequest));
  console.log('\n=== SENDING REQUEST ===\n');

  try {
    const response = await axios.post(AMAZON_CONFIG.testUrl, cxmlRequest, {
      headers: {
        'Content-Type': 'text/xml; charset=UTF-8',
        'Accept': 'text/xml,application/xml'
      },
      maxRedirects: 0,
      validateStatus: (status) => status >= 200 && status < 400
    });

    console.log('✅ SUCCESS');
    console.log('Status:', response.status);
    console.log('\nResponse Body:\n', response.data);

    if (typeof response.data === 'string') {
      const startUrlMatch = response.data.match(/<URL>([^<]+)<\/URL>/);
      if (startUrlMatch) {
        console.log('\nStartPage URL:', startUrlMatch[1]);
      }
    }
  } catch (error) {
    console.log('❌ ERROR');
    console.log('Status:', error.response?.status, error.response?.statusText);
    console.log('Response:', error.response?.data);
    console.log('\nError Message:', error.message);
  }
}

testAmazonPunchout();

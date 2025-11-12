const axios = require('axios');
const crypto = require('crypto');

// Amazon test configuration (from your .env)
const AMAZON_CONFIG = {
  identity: 'Punchout0108915513',
  sharedSecret: 'iH082QQ06iKQTKP56FvnItOXv3HSR2',
  testUrl: 'https://abintegrations.amazon.com/punchout/test'
};

// Build test cXML request
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
        <URL>http://localhost:5000/api/amazon-punchout/return</URL>
      </BrowserFormPost>
      <SupplierSetup>
        <URL>${AMAZON_CONFIG.testUrl}</URL>
      </SupplierSetup>
      <Extrinsic name="UserEmail">test@yeemscoffee.com</Extrinsic>
      <Contact role="buyer">
        <Name xml:lang="en-US">Test User</Name>
        <Email>test@yeemscoffee.com</Email>
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
  console.log('\ncXML Request:\n', cxmlRequest);
  console.log('\n=== SENDING REQUEST ===\n');

  try {
    const response = await axios.post(
      AMAZON_CONFIG.testUrl,
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

    console.log('✅ SUCCESS!');
    console.log('Status:', response.status);
    console.log('Headers:', JSON.stringify(response.headers, null, 2));
    console.log('\nResponse Body:\n', response.data);

    // Try to extract StartPage URL
    if (typeof response.data === 'string') {
      const startUrlMatch = response.data.match(/<URL>([^<]+)<\/URL>/);
      if (startUrlMatch) {
        console.log('\n🎉 StartPage URL found:', startUrlMatch[1]);
      }
    }

  } catch (error) {
    console.log('❌ ERROR');
    console.log('Status:', error.response?.status);
    console.log('Status Text:', error.response?.statusText);
    console.log('Headers:', JSON.stringify(error.response?.headers || {}, null, 2));
    console.log('Response:', error.response?.data);
    console.log('\nError Message:', error.message);

    if (error.response?.status === 400) {
      console.log('\n💡 Still getting 400 error. This means:');
      console.log('   - The Content-Type: text/xml might not be the issue');
      console.log('   - Or Amazon may require form-urlencoded instead');
      console.log('   - Or there might be an issue with the cXML structure');
      console.log('   - Or credentials may not be valid');
    }
  }
}

testAmazonPunchout();

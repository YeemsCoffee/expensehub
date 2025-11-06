require('dotenv').config();

const timestamp = new Date().toISOString();
const payloadId = `${Date.now()}-sample`;
const buyerCookie = 'sample-cookie-12345';

const cxmlRequest = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE cXML SYSTEM "http://xml.cxml.org/schemas/cXML/1.2.014/cXML.dtd">
<cXML payloadID="${payloadId}" timestamp="${timestamp}" xml:lang="en-US">
  <Header>
    <From>
      <Credential domain="NetworkId">
        <Identity>${process.env.AMAZON_PUNCHOUT_IDENTITY}</Identity>
      </Credential>
    </From>
    <To>
      <Credential domain="NetworkId">
        <Identity>Amazon</Identity>
      </Credential>
    </To>
    <Sender>
      <Credential domain="NetworkId">
        <Identity>${process.env.AMAZON_PUNCHOUT_IDENTITY}</Identity>
        <SharedSecret>${process.env.AMAZON_PUNCHOUT_SECRET}</SharedSecret>
      </Credential>
      <UserAgent>ExpenseHub 1.0</UserAgent>
    </Sender>
  </Header>
  <Request deploymentMode="${process.env.AMAZON_PUNCHOUT_USE_PROD === 'true' ? 'production' : 'test'}">
    <PunchOutSetupRequest operation="create">
      <BuyerCookie>${buyerCookie}</BuyerCookie>
      <Extrinsic name="User">user@example.com</Extrinsic>
      <Extrinsic name="UserEmail">user@example.com</Extrinsic>
      <BrowserFormPost>
        <URL>${process.env.FRONTEND_URL || 'http://localhost:3000'}/api/amazon-punchout/return</URL>
      </BrowserFormPost>
      <Contact role="buyer">
        <Name xml:lang="en-US">Sample User</Name>
        <Email>user@example.com</Email>
      </Contact>
      <SupplierSetup>
        <URL>${process.env.AMAZON_PUNCHOUT_USE_PROD === 'true' ? process.env.AMAZON_PUNCHOUT_URL : process.env.AMAZON_PUNCHOUT_TEST_URL}</URL>
      </SupplierSetup>
    </PunchOutSetupRequest>
  </Request>
</cXML>`;

console.log('\n📄 Sample cXML PunchOutSetupRequest');
console.log('='.repeat(80));
console.log(cxmlRequest);
console.log('='.repeat(80));
console.log('\nKey Elements:');
console.log('  From Identity:', process.env.AMAZON_PUNCHOUT_IDENTITY);
console.log('  To Identity: Amazon');
console.log('  Deployment Mode:', process.env.AMAZON_PUNCHOUT_USE_PROD === 'true' ? 'production' : 'test');
console.log('  Return URL:', process.env.FRONTEND_URL || 'http://localhost:3000', '/api/amazon-punchout/return');
console.log('  Target URL:', process.env.AMAZON_PUNCHOUT_USE_PROD === 'true' ? process.env.AMAZON_PUNCHOUT_URL : process.env.AMAZON_PUNCHOUT_TEST_URL);
console.log('\n✅ This cXML format matches Amazon\'s documentation\n');

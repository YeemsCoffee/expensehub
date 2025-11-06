const axios = require('axios');
const db = require('./config/database');

async function testAmazonPunchout() {
  try {
    console.log('\n🧪 Testing Amazon Punchout Integration\n');
    console.log('='.repeat(50));

    // Step 1: Check database setup
    console.log('\n1. Checking database setup...');

    const tableCheck = await db.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = 'punchout_sessions'
    `);

    if (tableCheck.rows.length === 0) {
      console.log('   ✗ punchout_sessions table not found');
      return;
    }
    console.log('   ✓ punchout_sessions table exists');

    const vendorCheck = await db.query(
      "SELECT id, name FROM vendors WHERE name = 'Amazon Business'"
    );

    if (vendorCheck.rows.length === 0) {
      console.log('   ✗ Amazon Business vendor not found');
      return;
    }
    console.log('   ✓ Amazon Business vendor exists (ID:', vendorCheck.rows[0].id + ')');

    // Step 2: Check environment configuration
    console.log('\n2. Checking environment configuration...');
    const requiredEnvVars = [
      'AMAZON_PUNCHOUT_IDENTITY',
      'AMAZON_PUNCHOUT_SECRET',
      'AMAZON_PUNCHOUT_URL',
      'AMAZON_PUNCHOUT_TEST_URL'
    ];

    let allEnvVarsPresent = true;
    for (const envVar of requiredEnvVars) {
      if (process.env[envVar]) {
        console.log(`   ✓ ${envVar} is set`);
      } else {
        console.log(`   ✗ ${envVar} is missing`);
        allEnvVarsPresent = false;
      }
    }

    if (!allEnvVarsPresent) {
      console.log('\n   Please check your .env file');
      return;
    }

    // Step 3: Verify credentials format
    console.log('\n3. Verifying credentials...');
    console.log('   Identity:', process.env.AMAZON_PUNCHOUT_IDENTITY);
    console.log('   Secret:', process.env.AMAZON_PUNCHOUT_SECRET?.substring(0, 10) + '...');
    console.log('   Mode:', process.env.AMAZON_PUNCHOUT_USE_PROD === 'true' ? 'PRODUCTION' : 'TEST');
    const targetUrl = process.env.AMAZON_PUNCHOUT_USE_PROD === 'true'
      ? process.env.AMAZON_PUNCHOUT_URL
      : process.env.AMAZON_PUNCHOUT_TEST_URL;
    console.log('   Target URL:', targetUrl);

    // Step 4: Test creating a punchout session (without actually calling Amazon)
    console.log('\n4. Testing session creation...');

    // Get a test user
    const userCheck = await db.query('SELECT id, email FROM users LIMIT 1');
    if (userCheck.rows.length === 0) {
      console.log('   ✗ No users found in database. Please create a user first.');
      return;
    }

    const testUser = userCheck.rows[0];
    testUser.name = testUser.email.split('@')[0]; // Use email prefix as name
    console.log('   Using test user:', testUser.email);

    // Create a test session
    const sessionResult = await db.query(
      `INSERT INTO punchout_sessions (
        user_id,
        vendor_id,
        cost_center_id,
        vendor_name,
        status,
        buyer_cookie
      ) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [testUser.id, '1', null, 'Amazon Business', 'test', 'test-cookie-' + Date.now()]
    );

    console.log('   ✓ Test session created (ID:', sessionResult.rows[0].id + ')');

    // Step 5: Build a sample cXML request
    console.log('\n5. Building sample cXML request...');
    const timestamp = new Date().toISOString();
    const payloadId = `${Date.now()}-test`;

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
      <BuyerCookie>${sessionResult.rows[0].buyer_cookie}</BuyerCookie>
      <Extrinsic name="User">${testUser.email}</Extrinsic>
      <Extrinsic name="UserEmail">${testUser.email}</Extrinsic>
      <BrowserFormPost>
        <URL>${process.env.FRONTEND_URL || 'http://localhost:3000'}/api/amazon-punchout/return</URL>
      </BrowserFormPost>
      <Contact role="buyer">
        <Name xml:lang="en-US">${testUser.name || testUser.email}</Name>
        <Email>${testUser.email}</Email>
      </Contact>
      <SupplierSetup>
        <URL>${targetUrl}</URL>
      </SupplierSetup>
    </PunchOutSetupRequest>
  </Request>
</cXML>`;

    console.log('   ✓ cXML request built successfully');
    console.log('   PayloadID:', payloadId);
    console.log('   Timestamp:', timestamp);

    // Step 6: Test connection to Amazon (optional - can be skipped)
    console.log('\n6. Testing connection to Amazon Business...');
    console.log('   Target URL:', targetUrl);

    try {
      // Try to make a request to Amazon
      console.log('   Attempting to connect to Amazon...');

      const response = await axios.post(targetUrl, cxmlRequest, {
        headers: {
          'Content-Type': 'text/xml',
        },
        timeout: 10000,
        validateStatus: (status) => status < 600 // Accept all responses
      });

      console.log('   ✓ Connection successful!');
      console.log('   Response status:', response.status);

      if (response.status === 200) {
        console.log('   ✓ Amazon accepted the request');
        // Parse response to check for errors
        if (response.data.includes('<Status code="200"') || response.data.includes('PunchOutSetupResponse')) {
          console.log('   ✓ Punchout setup successful!');
        } else if (response.data.includes('error') || response.data.includes('Error')) {
          console.log('   ⚠ Amazon returned an error:');
          console.log('   ', response.data.substring(0, 500));
        }
      } else {
        console.log('   ⚠ Unexpected status code:', response.status);
      }
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        console.log('   ✗ Connection refused - Amazon server may be unreachable');
      } else if (error.code === 'ETIMEDOUT') {
        console.log('   ✗ Connection timed out');
      } else if (error.response) {
        console.log('   ⚠ Amazon responded with status:', error.response.status);
        console.log('   Response:', error.response.data?.substring(0, 500));
      } else {
        console.log('   ✗ Connection error:', error.message);
      }
    }

    // Step 7: Clean up test session
    console.log('\n7. Cleaning up test data...');
    await db.query('DELETE FROM punchout_sessions WHERE id = $1', [sessionResult.rows[0].id]);
    console.log('   ✓ Test session deleted');

    console.log('\n' + '='.repeat(50));
    console.log('\n✅ Amazon Punchout Integration Test Complete!\n');
    console.log('Summary:');
    console.log('  - Database setup: ✓');
    console.log('  - Environment configuration: ✓');
    console.log('  - cXML generation: ✓');
    console.log('\nTo actually test the punchout flow:');
    console.log('  1. Start the backend: npm start');
    console.log('  2. Start the frontend: cd ../frontend && npm start');
    console.log('  3. Login and go to Marketplace');
    console.log('  4. Click "Shop on Amazon Business"');
    console.log('\n');

    process.exit(0);
  } catch (error) {
    console.error('\n✗ Test failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

testAmazonPunchout();

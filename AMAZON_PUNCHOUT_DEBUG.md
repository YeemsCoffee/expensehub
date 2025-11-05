# Amazon Business Punchout Debugging Guide

## HTTP 400 Error Troubleshooting

You're getting an HTTP 400 error, which means Amazon is rejecting your request as malformed. Here's how to debug it:

### Step 1: Verify Your Credentials

Make sure your `.env` file has the correct Amazon Business credentials:

```bash
# Amazon Business Punchout Configuration
AMAZON_PUNCHOUT_MODE=test                    # or 'production'
AMAZON_PUNCHOUT_TEST_URL=https://test-url-from-amazon.com
AMAZON_PUNCHOUT_URL=https://production-url-from-amazon.com
AMAZON_SENDER_ID=your-company-identifier     # Provided by Amazon
AMAZON_SHARED_SECRET=your-secret-key         # Provided by Amazon
AMAZON_IDENTITY=your-company-identifier      # Usually same as SENDER_ID
```

### Step 2: Test the Connection

Use the new test endpoint to see the actual error from Amazon:

```bash
curl -X POST http://localhost:5000/api/punchout/test/amazon_business \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -H "Content-Type: application/json"
```

Or use this JavaScript in your browser console (while logged in):

```javascript
fetch('/api/punchout/test/amazon_business', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + localStorage.getItem('token'),
    'Content-Type': 'application/json'
  }
})
.then(r => r.json())
.then(data => {
  console.log('=== TEST RESULTS ===');
  console.log('Success:', data.success);
  console.log('Status:', data.status, data.statusText);
  console.log('\nAmazon\'s Response:');
  console.log(data.data);
  console.log('\nRequest Sent:');
  console.log(data.requestSent.cxmlPreview);
});
```

### Step 3: Common Issues and Solutions

#### Issue 1: Wrong toIdentity

**Error:** Amazon returns "Invalid toIdentity"
**Solution:** Amazon Business expects `toIdentity` to be exactly "Amazon" (with capital A)
- Check: `punchoutVendors.js` line 15 should have: `toIdentity: 'Amazon'`

#### Issue 2: Wrong Domain

**Error:** "Invalid credential domain"
**Solution:** Amazon Business uses "NetworkId" domain, not "DUNS"
- This should be automatic, but verify in the logs

#### Issue 3: Missing or Wrong SharedSecret

**Error:** "Authentication failed" or "Invalid credentials"
**Solution:** Verify your shared secret matches what Amazon provided
- Check: `AMAZON_SHARED_SECRET` in your `.env` file
- The secret should now be in both From and Sender credentials (fixed in latest code)

#### Issue 4: Invalid Return URL

**Error:** "Invalid BrowserFormPost URL"
**Solution:** The return URL must be:
1. A fully qualified URL (including https://)
2. Accessible from the internet (not localhost in production)
3. Match the URL registered with Amazon

Current return URL: `${FRONTEND_URL}/api/punchout/return`

**For local testing:** You may need to use a tool like ngrok to expose your local server:
```bash
ngrok http 5000
# Then use: https://your-ngrok-url.ngrok.io/api/punchout/return
```

#### Issue 5: Wrong Punchout URL

**Error:** 400 before even connecting
**Solution:** Verify the punchout URL is correct
- Test URL: Usually something like `https://test-punchout.amazon.com/...`
- Production URL: Different from test URL
- Check with your Amazon Business account manager

### Step 4: Analyze the cXML Request

Check the server logs for the full cXML request being sent. It should look like this:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE cXML SYSTEM "http://xml.cxml.org/schemas/cXML/1.2.014/cXML.dtd">
<cXML payloadID="..." timestamp="..." xml:lang="en-US">
  <Header>
    <From>
      <Credential domain="NetworkId">
        <Identity>your-company-identifier</Identity>
        <SharedSecret>your-secret</SharedSecret>
      </Credential>
    </From>
    <To>
      <Credential domain="NetworkId">
        <Identity>Amazon</Identity>
      </Credential>
    </To>
    <Sender>
      <Credential domain="NetworkId">
        <Identity>your-company-identifier</Identity>
        <SharedSecret>your-secret</SharedSecret>
      </Credential>
      <UserAgent>ExpenseHub Procurement v1.0</UserAgent>
    </Sender>
  </Header>
  <Request deploymentMode="test">
    <PunchOutSetupRequest operation="create">
      <BuyerCookie>session-id</BuyerCookie>
      <Extrinsic name="UserEmail">user@company.com</Extrinsic>
      <Extrinsic name="UniqueName">session-id</Extrinsic>
      <BrowserFormPost>
        <URL>https://your-site.com/api/punchout/return</URL>
      </BrowserFormPost>
      <Contact role="endUser">
        <Name xml:lang="en-US">user@company.com</Name>
        <Email>user@company.com</Email>
      </Contact>
    </PunchOutSetupRequest>
  </Request>
</cXML>
```

### Step 5: Contact Amazon Support

If you're still getting a 400 error after verifying all the above:

1. Save the full cXML request from the logs
2. Save the full error response from the test endpoint
3. Contact your Amazon Business account manager with:
   - Your company identifier
   - The test/production mode you're using
   - The full cXML request
   - The full error response
   - The exact timestamp of a failed attempt

### Recent Code Changes

The following improvements were made to fix common issues:

1. **XML Escaping:** Special characters in emails, user IDs, etc. are now properly escaped
2. **SharedSecret in From:** The shared secret is now included in the From credential block (required by some vendors)
3. **Better Logging:** More detailed logs show exactly what's being sent
4. **Domain Configuration:** Both fromDomain and toDomain are now configurable
5. **Test Endpoint:** New `/api/punchout/test/:vendorId` endpoint returns the actual error from Amazon

### Next Steps

1. Run the test endpoint to see the actual error from Amazon
2. Compare the error message with the common issues above
3. Verify all credentials match what Amazon provided
4. Check that your return URL is accessible
5. If still failing, contact Amazon with the debugging information

### Useful Commands

Check server logs:
```bash
pm2 logs backend
# or
node server.js
```

Test environment variables are loaded:
```bash
node -e "require('dotenv').config(); console.log(process.env.AMAZON_SENDER_ID)"
```

Clear any cached data:
```bash
pm2 restart backend
```

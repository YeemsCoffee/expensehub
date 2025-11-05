# Amazon Punchout HTTP 400 Error - Fixes Applied

## Problem
Getting HTTP 400 (Bad Request) error when trying to connect to Amazon Business punchout service.

## Root Causes Identified
1. XML special characters not being escaped
2. SharedSecret possibly missing from From credential block
3. Insufficient error logging/debugging capabilities
4. No way to see the actual error message from Amazon

## Fixes Applied

### 1. Enhanced cXML Generation (`punchoutService.js`)

**What Changed:**
- Added XML character escaping for all user-provided data (emails, IDs, etc.)
- Added SharedSecret to the From credential block (required by some vendors)
- Made domain configuration more flexible (fromDomain and toDomain)
- Enhanced logging with partial secret display for security
- Added helpful hints in console output

**Code Location:** `backend/services/punchoutService.js` lines 9-103

### 2. Added Test Endpoint (`punchout.js`)

**What Changed:**
- New `POST /api/punchout/test/:vendorId` endpoint
- Makes actual HTTP call to Amazon's API
- Returns the full error response for debugging
- Logs detailed information about request/response
- Uses axios with custom configuration for better error handling

**Code Location:** `backend/routes/punchout.js` lines 240-350

### 3. Created Debugging Tools

**Files Created:**
1. `AMAZON_PUNCHOUT_DEBUG.md` - Comprehensive debugging guide
2. `backend/test-punchout.html` - Interactive test page

## How to Use the Debugging Tools

### Method 1: Test Endpoint (Recommended)

1. Make sure your backend is running:
   ```bash
   cd backend
   npm start
   ```

2. Get your auth token (login to your app, then check localStorage)

3. Use curl or Postman:
   ```bash
   curl -X POST http://localhost:5000/api/punchout/test/amazon_business \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json"
   ```

4. Check the response - it will show you Amazon's actual error message

### Method 2: HTML Test Page

1. Open `backend/test-punchout.html` in your browser

2. Click "Load from localStorage" to load your token

3. Click "Test Amazon Punchout"

4. Review the detailed results showing:
   - The exact cXML request sent
   - Amazon's response status
   - Amazon's error message
   - Helpful hints about what might be wrong

## Common Issues and Solutions

### Issue: "Invalid toIdentity"
**Fix:** Ensure `toIdentity: 'Amazon'` in `punchoutVendors.js` (capital A)

### Issue: "Authentication failed"
**Fix:** Verify `AMAZON_SHARED_SECRET` in `.env` matches what Amazon provided

### Issue: "Invalid credential domain"
**Fix:** Should auto-use "NetworkId" - check logs to verify

### Issue: "Invalid BrowserFormPost URL"
**Fix:**
- URL must be fully qualified (https://...)
- Must be accessible from internet (not localhost in production)
- For local testing, use ngrok or similar
- Must match URL registered with Amazon

## Verification Checklist

Before testing again, verify:

- [ ] `.env` file has all Amazon credentials
- [ ] `AMAZON_SENDER_ID` matches what Amazon provided
- [ ] `AMAZON_SHARED_SECRET` matches what Amazon provided
- [ ] `AMAZON_PUNCHOUT_URL` is correct (test or production)
- [ ] `AMAZON_PUNCHOUT_MODE` is set to 'test' or 'production'
- [ ] Return URL is accessible (use ngrok for local testing)
- [ ] Backend server is running
- [ ] You have a valid auth token

## Next Steps

1. **Run the test endpoint** to see the actual error from Amazon

2. **Compare the error** with the common issues in `AMAZON_PUNCHOUT_DEBUG.md`

3. **Verify credentials** - Most 400 errors are due to credential mismatches

4. **Check the logs** - Server console will show detailed information

5. **If still failing:**
   - Save the full error response
   - Save the cXML request being sent
   - Contact Amazon Business support with both
   - Reference this timestamp in their logs

## Enhanced Logging

The server now logs:
```
=== cXML PunchOut Request ===
Timestamp: 2025-01-...
PayloadID: ...
From Domain: NetworkId
From Identity: your-company-id
To Domain: NetworkId
To Identity: Amazon
Sender Identity: your-company-id
Shared Secret: ***your***
Deployment Mode: test
Return URL: https://...

Full cXML (first 500 chars):
<?xml version="1.0"...

==================================================
IMPORTANT: Check that your credentials match what Amazon provided
- fromIdentity should be your company identifier from Amazon
- toIdentity should be "Amazon" (as per Amazon documentation)
- sharedSecret should be the secret Amazon provided
- returnUrl should be accessible from the internet
==================================================
```

## Files Modified

1. `backend/services/punchoutService.js` - Enhanced cXML generation
2. `backend/routes/punchout.js` - Added test endpoint

## Files Created

1. `AMAZON_PUNCHOUT_DEBUG.md` - Debugging guide
2. `FIXES_APPLIED.md` - This file
3. `backend/test-punchout.html` - Test page

## Testing the Fix

1. Restart your backend server:
   ```bash
   pm2 restart backend
   # or
   npm start
   ```

2. Open `backend/test-punchout.html` in your browser

3. Run the test and review the results

4. Check server console for detailed logs

5. If you see a specific error from Amazon, search for it in `AMAZON_PUNCHOUT_DEBUG.md`

## Support

If you're still experiencing issues:

1. Check the server logs for the full cXML request
2. Run the test endpoint to get Amazon's error message
3. Compare with the common issues in the debug guide
4. Verify all credentials with your Amazon Business account manager
5. If needed, provide Amazon support with:
   - The full cXML request (from logs)
   - The full error response (from test endpoint)
   - Your company identifier
   - The exact timestamp of a failed request

## Security Notes

- The SharedSecret is now partially obscured in logs (shows only first 4 characters)
- Never commit `.env` file with real credentials
- Use test mode for development
- Rotate secrets periodically as recommended by Amazon

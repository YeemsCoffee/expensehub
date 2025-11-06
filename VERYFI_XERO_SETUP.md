# Veryfi OCR + Xero Integration Setup Guide

This guide will walk you through setting up receipt OCR with Veryfi and accounting sync with Xero.

---

## 🎯 What's New

### **Veryfi Receipt OCR**
- ✅ Snap photo of receipt → Auto-extract vendor, date, amount, tax, line items
- ✅ 98.7% accuracy (industry-leading)
- ✅ <3 second processing time
- ✅ 100 free receipts/month, then $0.10-0.20 per receipt
- ✅ Auto-categorization and expense form pre-fill

### **Xero Accounting Integration**
- ✅ OAuth 2.0 secure connection
- ✅ Auto-sync approved expenses as bills
- ✅ Chart of accounts mapping
- ✅ Automatic contact creation for vendors
- ✅ Bulk sync multiple expenses

---

## 📋 Prerequisites

1. **Veryfi Account** - Sign up at [veryfi.com](https://www.veryfi.com/)
2. **Xero Account** - You need a Xero subscription
3. **Xero Developer App** - Create at [developer.xero.com](https://developer.xero.com/)

---

## 🔧 Step 1: Veryfi Setup (15 minutes)

### 1.1 Create Veryfi Account
1. Go to https://www.veryfi.com/
2. Click "Sign Up" → Choose plan (Start with Free - 100 receipts/month)
3. Verify your email

### 1.2 Get API Credentials
1. Log in to Veryfi Hub: https://hub.veryfi.com/
2. Go to **API Keys** → https://hub.veryfi.com/api/settings/keys/
3. You'll see:
   - **Client ID** (e.g., `vrfABC123...`)
   - **Client Secret** (e.g., `abcd1234...`)
   - **Username** (your Veryfi username)
   - **API Key** (e.g., `1234abcd...`)

4. Copy all 4 values

### 1.3 Add to .env File
Add these to your `backend/.env` file:

```bash
# Veryfi OCR Configuration
VERYFI_CLIENT_ID=your_client_id_here
VERYFI_CLIENT_SECRET=your_client_secret_here
VERYFI_USERNAME=your_username_here
VERYFI_API_KEY=your_api_key_here
```

### 1.4 Test Veryfi (Optional)
You can test your credentials:
```bash
cd backend
node -e "
const Client = require('@veryfi/veryfi-sdk');
const veryfi = new Client(
  process.env.VERYFI_CLIENT_ID,
  process.env.VERYFI_CLIENT_SECRET,
  process.env.VERYFI_USERNAME,
  process.env.VERYFI_API_KEY
);
console.log('Veryfi client initialized successfully!');
"
```

---

## 🔧 Step 2: Xero Setup (20 minutes)

### 2.1 Create Xero Developer App
1. Go to https://developer.xero.com/app/manage
2. Click **New app**
3. Fill in:
   - **App name**: ExpenseHub
   - **Integration type**: Web app
   - **Company or application URL**: `http://localhost:3000` (or your domain)
   - **OAuth 2.0 redirect URI**: `http://localhost:5000/api/xero/callback`
     - For production: `https://your-backend.com/api/xero/callback`
4. Click **Create app**

### 2.2 Get Xero Credentials
After creating the app, you'll see:
- **Client ID** (e.g., `ABC123DEF456...`)
- **Client Secret** (click "Generate a secret")

Copy both values.

### 2.3 Add to .env File
Add these to your `backend/.env` file:

```bash
# Xero Accounting Integration
XERO_CLIENT_ID=your_xero_client_id_here
XERO_CLIENT_SECRET=your_xero_client_secret_here
XERO_REDIRECT_URI=http://localhost:5000/api/xero/callback
```

**For Production (Render):**
```bash
XERO_REDIRECT_URI=https://your-app.onrender.com/api/xero/callback
```

### 2.4 Important: Update Xero App Settings
After deploying to production:
1. Go back to https://developer.xero.com/app/manage
2. Click your app → **Configuration**
3. Add production redirect URI: `https://your-app.onrender.com/api/xero/callback`
4. Save

---

## 🚀 Step 3: Restart Server

```bash
cd backend
npm start
```

You should see:
```
✅ Connected to PostgreSQL database
🚀 ExpenseHub API Server - Enhanced
📍 Running on: http://localhost:5000
```

---

## 📱 Step 4: Using Receipt OCR

### In the Frontend:

1. Go to **Submit Expense** page
2. You'll see a new **"Upload Receipt"** button
3. Click it or drag & drop a receipt image
4. Veryfi processes in ~3 seconds
5. Expense form auto-fills with:
   - ✅ Vendor name
   - ✅ Date
   - ✅ Amount
   - ✅ Category (auto-detected)
   - ✅ Tax
   - ✅ Line items

6. Review and edit if needed
7. Submit expense

### Supported File Types:
- **Images**: JPG, PNG, GIF, HEIC
- **Documents**: PDF
- **Max size**: 10MB

---

## 💼 Step 5: Using Xero Sync

### 5.1 Connect Xero (One-time setup)

1. Go to **Settings** → **Integrations** (or **Xero Settings**)
2. Click **Connect to Xero**
3. You'll be redirected to Xero login
4. Log in to your Xero account
5. **Authorize** ExpenseHub to access your Xero data
6. You'll be redirected back to ExpenseHub
7. Select your Xero organization (if you have multiple)

### 5.2 Map Accounts

Map expense categories to your Xero chart of accounts:

1. Go to **Xero Settings** → **Account Mapping**
2. For each category, select the Xero account:
   - **Meals** → Account 420 (Meals & Entertainment)
   - **Travel** → Account 493 (Travel)
   - **Office Supplies** → Account 461 (Office Supplies)
   - **Software** → Account 453 (Software)
   - etc.

3. Click **Save Mappings**

### 5.3 Sync Expenses

**Option A: Manual Sync (Single Expense)**
1. Go to **Expense History**
2. Find an **approved** expense
3. Click **⋮** menu → **Sync to Xero**
4. Confirm
5. Expense appears in Xero as a Bill (Accounts Payable)

**Option B: Bulk Sync (Multiple Expenses)**
1. Go to **Expense History**
2. Filter to **Status: Approved**
3. Select multiple expenses (checkboxes)
4. Click **Bulk Actions** → **Sync to Xero**
5. All selected expenses sync at once

**Option C: Auto-Sync (Coming Soon)**
- Expenses can auto-sync on approval

### 5.4 What Gets Synced to Xero

When an expense syncs:
- ✅ **Type**: Bill (ACCPAY - Accounts Payable)
- ✅ **Contact**: Vendor (auto-created if new)
- ✅ **Date**: Expense date
- ✅ **Line Items**:
  - Uses receipt line items if available
  - Or creates single line for total amount
- ✅ **Account Code**: Based on your category mapping
- ✅ **Status**: AUTHORISED (ready for payment)
- ✅ **Reference**: Expense ID

### 5.5 View in Xero

1. Log in to Xero
2. Go to **Accounts** → **Purchases** → **Awaiting Payment**
3. You'll see your synced expenses as bills
4. Pay them through Xero's normal process

---

## 🔍 API Endpoints Reference

### Receipt OCR Endpoints

```bash
# Upload receipt (multipart/form-data)
POST /api/receipts/upload
Headers: Authorization: Bearer <token>
Body: { receipt: <file> }

# Process receipt from URL
POST /api/receipts/process-url
Body: { url: "https://..." }

# Get all receipts
GET /api/receipts

# Get single receipt
GET /api/receipts/:id

# Re-process receipt
POST /api/receipts/:id/re-process

# Delete receipt
DELETE /api/receipts/:id
```

### Xero Endpoints

```bash
# Get authorization URL
GET /api/xero/connect

# OAuth callback (automatic)
GET /api/xero/callback?code=...&state=...

# Check connection status
GET /api/xero/status

# Disconnect
POST /api/xero/disconnect
Body: { tenantId: "..." }

# Get chart of accounts
GET /api/xero/accounts?tenantId=...

# Get account mappings
GET /api/xero/mappings?tenantId=...

# Save account mapping
POST /api/xero/mappings
Body: { tenantId, category, accountCode, accountName }

# Sync single expense
POST /api/xero/sync/:expenseId
Body: { tenantId: "..." }

# Bulk sync expenses
POST /api/xero/sync-bulk
Body: { tenantId: "...", expenseIds: [...] }

# Get organization info
GET /api/xero/organization?tenantId=...
```

---

## 💰 Pricing

### Veryfi
- **Free Tier**: 100 receipts/month
- **Pay-as-you-go**: $0.10-0.20 per receipt
- **No monthly minimum**

### Xero
- **API Access**: FREE (included with Xero subscription)
- You only pay for your Xero subscription ($13-70/month depending on plan)

---

## 🐛 Troubleshooting

### Veryfi Issues

**Error: "Invalid credentials"**
- Check that all 4 values are correct (CLIENT_ID, CLIENT_SECRET, USERNAME, API_KEY)
- Make sure there are no extra spaces in .env file

**Error: "Quota exceeded"**
- You've used your 100 free receipts this month
- Upgrade your Veryfi plan or wait until next month

**Low confidence scores**
- Receipt image is blurry or poor quality
- Try re-taking the photo with better lighting
- Use the re-process endpoint to try again

### Xero Issues

**Error: "Not connected to Xero"**
- Your OAuth token expired (they expire after 30 minutes of inactivity)
- Reconnect: Go to Settings → Disconnect → Connect again

**Error: "Invalid redirect URI"**
- Your XERO_REDIRECT_URI doesn't match what's in Xero Developer Portal
- Update Xero app settings to match your actual callback URL

**Expense not syncing**
- Only APPROVED expenses can sync
- Expense can't already be synced (check xero_invoice_id)
- Make sure you've mapped the expense category to a Xero account

**Token refresh failed**
- Xero refresh tokens expire after 60 days of inactivity
- Disconnect and reconnect to Xero

---

## 🔒 Security Notes

### Veryfi
- API keys are secret - never commit to git
- Veryfi automatically deletes processed documents after 30 days
- All data transmission is encrypted (HTTPS)

### Xero
- OAuth tokens stored encrypted in database
- Access tokens expire after 30 minutes (auto-refreshed)
- Refresh tokens expire after 60 days (must reconnect)
- Use environment variables for client secrets

### Best Practices
- ✅ Use HTTPS in production
- ✅ Keep .env files out of git (.gitignore)
- ✅ Use environment variables in Render/production
- ✅ Regularly rotate Xero connection (every 60 days)
- ✅ Monitor Veryfi usage to avoid unexpected charges

---

## 📊 Monitoring

### Veryfi Dashboard
- View usage: https://hub.veryfi.com/
- See processed documents, accuracy stats
- Monitor your quota

### Xero
- View synced bills: Xero → Purchases → Awaiting Payment
- Check for sync errors in ExpenseHub logs

---

## 🎉 Success Checklist

- [ ] Veryfi account created and API keys added to .env
- [ ] Xero developer app created and credentials added to .env
- [ ] Server restarted and running without errors
- [ ] Tested receipt upload - OCR extracts data correctly
- [ ] Connected to Xero successfully
- [ ] Mapped expense categories to Xero accounts
- [ ] Synced test expense to Xero
- [ ] Verified bill appears in Xero

---

## 📞 Support

### Veryfi Support
- Documentation: https://www.veryfi.com/documentation/
- Email: support@veryfi.com

### Xero Support
- Developer docs: https://developer.xero.com/documentation/
- Community: https://central.xero.com/s/

### ExpenseHub
- Check server logs for detailed error messages
- Review SECURITY_FIXES.md for security best practices

---

**Last Updated**: November 6, 2025
**Version**: 1.0

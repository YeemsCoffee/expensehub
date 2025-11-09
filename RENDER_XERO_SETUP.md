# Fix 503 Error - Xero Integration on Render

## 🔍 Problem

You're getting a **503 Service Unavailable** error when trying to connect to Xero on your Render deployment at `https://expensehub-l8ka.onrender.com`.

## ✅ Solution

Follow these steps in order:

---

## Step 1: Add Environment Variables to Render

1. Go to: https://dashboard.render.com
2. Select your **backend service** (e.g., `expensehub-backend`)
3. Click **Environment** tab
4. Add these three variables:

```bash
XERO_CLIENT_ID=CABF71D80B6B4DC39055F337F362D561
XERO_CLIENT_SECRET=_Dw5akKuyFWX1sW6MzL94-CasWUFirPbLRhae6tKEA0WxGOH
XERO_REDIRECT_URI=https://expensehub-l8ka.onrender.com/api/xero/callback
```

5. Click **Save Changes** (this will trigger an automatic redeploy)

---

## Step 2: Database Migration (Automatic!)

**Good news!** The Xero database migration now runs **automatically** when your app starts.

When Render deploys your app (after you add the environment variables in Step 1), the server will:
1. Check if Xero tables exist
2. If not, create them automatically
3. Start the server

You don't need to do anything manually! Just check your Render logs after deployment to confirm you see:

```
✅ Xero migration applied successfully!
```

or

```
✅ Xero tables already exist - skipping migration
```

---

## Step 3: Update Xero Developer App

1. Go to: https://developer.xero.com/app/manage
2. Click your **ExpenseHub** app
3. Click **Configuration**
4. Under **OAuth 2.0 redirect URIs**, add:

```
https://expensehub-l8ka.onrender.com/api/xero/callback
```

5. Click **Save**

You should now have **TWO** redirect URIs:
- ✅ `http://localhost:5000/api/xero/callback` (for local dev)
- ✅ `https://expensehub-l8ka.onrender.com/api/xero/callback` (for production)

---

## Step 3: Verify Deployment

1. Wait for Render to finish deploying (after saving env variables in Step 1)
2. Check the **Logs** in Render dashboard
   - Look for: `✅ Xero migration applied successfully!`
   - Or: `✅ Xero tables already exist - skipping migration`
3. Visit: `https://expensehub-l8ka.onrender.com`
4. Go to **Settings** → **Xero Settings**
5. Click **"Connect to Xero"**

---

## ⚠️ Common Issues

### Issue: "Migration failed - relation does not exist"

**Solution:** The `expenses` table might not exist. This means your main database schema hasn't been applied. Contact your database administrator or check if the schema was properly initialized.

### Issue: "Invalid redirect URI"

**Solution:** Double-check that:
1. Your `XERO_REDIRECT_URI` in Render matches your app URL **exactly**
2. You added the redirect URI to your Xero app settings

### Issue: Still getting 503

**Check Render logs:**
1. Go to Render dashboard → Your service → Logs
2. Look for error messages
3. Common causes:
   - Database connection failed
   - Missing environment variables
   - Migration not applied

---

## 🧪 Testing

After completing all steps, test the connection:

1. Go to: `https://expensehub-l8ka.onrender.com`
2. Navigate to **Settings** → **Xero Settings**
3. Click **"Connect to Xero"**
4. You should be redirected to Xero login page
5. Log in and authorize ExpenseHub
6. You should be redirected back with "✅ Connected" status

---

## 📋 Quick Checklist

- [ ] Added `XERO_CLIENT_ID` to Render environment
- [ ] Added `XERO_CLIENT_SECRET` to Render environment
- [ ] Added `XERO_REDIRECT_URI` to Render environment
- [ ] Waited for Render to redeploy
- [ ] Ran database migration (`apply_xero_migration.js`)
- [ ] Added redirect URI to Xero developer app
- [ ] Tested connection - no 503 error
- [ ] Successfully connected to Xero

---

## 🆘 Still Having Issues?

If you're still getting errors, check:

1. **Render Logs** - Look for specific error messages
2. **Database Connection** - Ensure your Render PostgreSQL is running
3. **Environment Variables** - Verify all three XERO_* variables are set correctly
4. **Migration Status** - Run `apply_xero_migration.js` again to verify tables exist

---

## 📞 Need Help?

Check the Render logs for specific error messages and share them for troubleshooting.

**Last Updated:** November 9, 2025

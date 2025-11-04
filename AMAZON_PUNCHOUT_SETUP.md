# Amazon Business Punchout Setup Guide

Complete guide for integrating Amazon Business punchout with ExpenseHub.

## Prerequisites

- Active Amazon Business account
- Punchout feature enabled by Amazon
- Administrator access to your ExpenseHub backend

## Step 1: Gather Amazon Credentials

You should have received the following from Amazon Business:

### Required Information:
1. **DUNS Number** (or Company ID)
   - Example: `123456789`
   - This identifies your organization

2. **Shared Secret** (Password)
   - Example: `abc123xyz456secret`
   - Used for authentication

3. **Punchout URLs**:
   - **Test URL**: For testing integration
     - Example: `https://punchout-test.amazon.com/punchout`
   - **Production URL**: For live orders
     - Example: `https://punchout.amazon.com/punchout`

4. **Purchase Order URL** (if using OAG ordering):
   - Example: `https://po.amazon.com/oag`

## Step 2: Configure Backend Environment Variables

Edit `backend/.env` and fill in your credentials:

```bash
# Amazon Business Punchout Configuration
AMAZON_PUNCHOUT_MODE=test                    # Start with 'test', change to 'production' when ready
AMAZON_DUNS_NUMBER=123456789                 # Your DUNS number
AMAZON_SENDER_ID=YeemsCoffee                 # Your company identifier
AMAZON_SHARED_SECRET=your_actual_secret      # Shared secret from Amazon
AMAZON_PUNCHOUT_URL=https://punchout.amazon.com/punchout           # Production URL
AMAZON_PUNCHOUT_TEST_URL=https://punchout-test.amazon.com/punchout # Test URL
AMAZON_PO_URL=https://po.amazon.com/oag      # Purchase order URL (optional)
```

## Step 3: Provide Return URL to Amazon

Amazon needs to know where to send users back after shopping. Provide them:

**Local Development**:
```
http://localhost:3000/api/punchout/return
```

**Production (Render)**:
```
https://expensehub.onrender.com/api/punchout/return
```

## Step 4: Understanding the Punchout Flow

### Catalog Browsing (cXML Punchout):

```
1. User clicks "Shop Amazon Business" in ExpenseHub
   ↓
2. ExpenseHub generates cXML PunchOutSetupRequest with:
   - Your credentials (DUNS, shared secret)
   - User email
   - Return URL
   ↓
3. Amazon opens their catalog in iframe/new window
   ↓
4. User browses and adds items to Amazon cart
   ↓
5. User clicks "Return to ExpenseHub" in Amazon
   ↓
6. Amazon sends cXML PunchOutOrderMessage with cart items
   ↓
7. ExpenseHub receives items and adds to user's cart
```

### Purchase Order Submission (OAG):

```
1. User submits approved expense/cart in ExpenseHub
   ↓
2. ExpenseHub generates OAG Purchase Order XML with:
   - Order details
   - Line items
   - Shipping address
   - Billing info
   ↓
3. ExpenseHub sends to Amazon's PO URL
   ↓
4. Amazon processes and fulfills order
   ↓
5. Amazon sends confirmation back
```

## Step 5: Testing the Integration

### Phase 1: Test Mode
1. Set `AMAZON_PUNCHOUT_MODE=test` in .env
2. Restart backend: `npm start`
3. Click "Shop Amazon Business" in ExpenseHub
4. Browse Amazon's test catalog
5. Add items and return to ExpenseHub
6. Verify items appear in cart

### Phase 2: End-to-End Test
1. Complete a punchout session
2. Submit the cart/expense
3. Check if purchase order is sent (if configured)
4. Verify in Amazon Business portal

### Phase 3: Go Live
1. Set `AMAZON_PUNCHOUT_MODE=production`
2. Restart backend
3. Monitor first few transactions carefully

## Step 6: Deploy to Render

### Update Render Environment Variables:

1. Go to Render dashboard → Your web service → Environment
2. Add these variables:
   ```
   AMAZON_PUNCHOUT_MODE=production
   AMAZON_DUNS_NUMBER=your_actual_duns
   AMAZON_SENDER_ID=YeemsCoffee
   AMAZON_SHARED_SECRET=your_actual_secret
   AMAZON_PUNCHOUT_URL=https://punchout.amazon.com/punchout
   AMAZON_PUNCHOUT_TEST_URL=https://punchout-test.amazon.com/punchout
   AMAZON_PO_URL=https://po.amazon.com/oag
   FRONTEND_URL=https://expensehub.onrender.com
   ```

3. Click "Save Changes"
4. Render will automatically redeploy

## Troubleshooting

### Issue: "Invalid credentials" error

**Solution**: Double-check:
- DUNS number is correct
- Shared secret matches exactly
- No extra spaces in credentials

### Issue: Amazon shows blank page

**Solution**:
- Verify punchout URL is correct
- Check if test URL is different from production
- Ensure return URL is whitelisted with Amazon

### Issue: Items don't appear in cart

**Solution**:
- Check backend logs for parsing errors
- Verify return URL is accessible
- Ensure cXML response parsing is working

### Issue: Purchase orders failing

**Solution**:
- Verify PO URL is correct
- Check XML format matches Amazon's requirements
- Ensure all required fields are populated

## Security Best Practices

1. **Never commit credentials to git**:
   - `.env` is in `.gitignore`
   - Use environment variables

2. **Rotate secrets periodically**:
   - Update shared secret with Amazon
   - Update in Render environment variables

3. **Use test mode first**:
   - Always test before going to production
   - Verify all flows work correctly

4. **Monitor logs**:
   - Watch for authentication failures
   - Track successful transactions
   - Alert on errors

## Support

### Amazon Business Support:
- **Phone**: 1-888-281-3847
- **Email**: punchout-support@amazon.com
- **Hours**: Mon-Fri 8am-9pm ET

### Common Questions to Ask Amazon:

1. "What is my exact punchout URL?"
2. "What format do you prefer for POs - cXML or OAG?"
3. "Can you whitelist my return URL?"
4. "How do I access the test environment?"
5. "What is my DUNS number in your system?"

## Next Steps

After Amazon punchout is working:

1. **Add other vendors**:
   - Staples, Office Depot, CDW, etc.
   - Each has similar cXML setup

2. **Configure catalogs**:
   - Restrict items by category
   - Set spending limits
   - Create approval rules

3. **Set up analytics**:
   - Track punchout usage
   - Monitor cart abandonment
   - Analyze vendor spend

## Example Credentials Format

```bash
# Real example (with fake values)
AMAZON_DUNS_NUMBER=987654321
AMAZON_SENDER_ID=YeemsCoffee
AMAZON_SHARED_SECRET=P@ssw0rd!SecretKey123
AMAZON_PUNCHOUT_URL=https://punchout.amazon.com/punchout
AMAZON_PUNCHOUT_TEST_URL=https://punchout-test.amazon.com/punchout
AMAZON_PO_URL=https://business.amazon.com/api/v1/orders
```

## Testing Checklist

- [ ] Credentials added to `.env`
- [ ] Backend restarted
- [ ] Punchout button appears in UI
- [ ] Click button opens Amazon catalog
- [ ] Can browse and add items
- [ ] Return button sends back to ExpenseHub
- [ ] Items appear in cart
- [ ] Can submit expense with punchout items
- [ ] Purchase order sends to Amazon (if configured)
- [ ] Test in production mode
- [ ] Deploy to Render with production credentials

---

**Questions or issues?** Check the troubleshooting section or contact Amazon Business support.

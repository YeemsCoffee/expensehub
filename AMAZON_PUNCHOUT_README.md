# Amazon Business Punchout Integration

This document describes the Amazon Business cXML Punchout integration for the ExpenseHub application.

## Overview

The Amazon Punchout integration allows users to browse and purchase items directly from Amazon Business. Items selected on Amazon are automatically added to the user's cart in ExpenseHub.

## Features

- **Seamless Integration**: Users can click a button to be redirected to Amazon Business
- **Automatic Cart Sync**: Items selected on Amazon are automatically added to the ExpenseHub cart
- **Session Tracking**: All punchout sessions are tracked in the database for auditing
- **Cost Center Assignment**: Items can be assigned to specific cost centers
- **cXML Protocol**: Uses industry-standard cXML protocol for procurement

## Configuration

### Environment Variables

Add the following to your `.env` file:

```env
# Amazon Business Punchout Configuration
AMAZON_PUNCHOUT_IDENTITY=PunchoutGroup1556947794
AMAZON_PUNCHOUT_SECRET=pVn9bQwGGnl1KZ26VyblJJoXFJCXV2
AMAZON_PUNCHOUT_URL=https://abintegrations.amazon.com/punchout
AMAZON_PUNCHOUT_TEST_URL=https://abintegrations.amazon.com/punchout/test
AMAZON_PO_URL=https://https-ats.amazonsedi.com/2e947cf5-c06d-4411-bffd-57839c057856
AMAZON_PUNCHOUT_USE_PROD=false
```

**Important**:
- Set `AMAZON_PUNCHOUT_USE_PROD=true` for production environment
- The credentials provided are your specific Amazon Business integration credentials

### Database Setup

Run the migration to create the necessary tables:

```bash
cd backend
node fix-migration.js
```

This creates:
- `punchout_sessions` table to track punchout sessions
- Necessary indexes for performance
- Amazon Business vendor entry

## How It Works

### 1. Punchout Initiation

1. User clicks "Shop on Amazon Business" in the Marketplace
2. Frontend calls `POST /api/amazon-punchout/setup` with optional `costCenterId`
3. Backend creates a punchout session in the database
4. Backend generates a cXML PunchOutSetupRequest with credentials
5. Frontend receives the cXML and target URL
6. Frontend creates a hidden form and POSTs the cXML to Amazon

### 2. Shopping on Amazon

1. User is redirected to Amazon Business website
2. User browses and adds items to their Amazon cart
3. User clicks "Return to ExpenseHub" or similar button on Amazon

### 3. Return to ExpenseHub

1. Amazon POSTs a cXML PunchOutOrderMessage to `POST /api/amazon-punchout/return`
2. Backend parses the cXML response
3. Backend extracts line items (products, quantities, prices)
4. Backend creates/updates product entries in the database
5. Backend adds items to the user's cart
6. User is redirected back to ExpenseHub cart with success message

## API Endpoints

### POST /api/amazon-punchout/setup

Initiates a punchout session.

**Request Body:**
```json
{
  "costCenterId": 1
}
```

**Response:**
```json
{
  "sessionId": 123,
  "cxmlRequest": "<cXML>...</cXML>",
  "targetUrl": "https://abintegrations.amazon.com/punchout/test",
  "method": "POST"
}
```

### POST /api/amazon-punchout/return

Handles the return callback from Amazon. This endpoint accepts `text/xml` content type.

**Request Body:** cXML PunchOutOrderMessage (XML)

**Response:** HTML redirect page back to the application

### GET /api/amazon-punchout/session/:sessionId

Get details about a specific punchout session.

**Response:**
```json
{
  "id": 123,
  "user_id": 1,
  "vendor_name": "Amazon Business",
  "status": "completed",
  "buyer_cookie": "abc123...",
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:05:00Z"
}
```

### GET /api/amazon-punchout/history

Get user's punchout history.

**Response:**
```json
[
  {
    "id": 123,
    "vendor_name": "Amazon Business",
    "status": "completed",
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:05:00Z"
  }
]
```

## Frontend Usage

The Marketplace component (`frontend/src/pages/Marketplace.js`) includes the Amazon Business integration:

```jsx
// The Amazon Business card appears first in the vendor grid
// Clicking it initiates the punchout process
<button onClick={handleAmazonPunchout}>
  Shop on Amazon Business
</button>
```

When users return from Amazon with items, they see a success message and the items are in their cart.

## cXML Structure

### PunchOutSetupRequest (Sent to Amazon)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE cXML SYSTEM "http://xml.cxml.org/schemas/cXML/1.2.014/cXML.dtd">
<cXML payloadID="..." timestamp="..." xml:lang="en-US">
  <Header>
    <From>
      <Credential domain="NetworkId">
        <Identity>PunchoutGroup1556947794</Identity>
      </Credential>
    </From>
    <To>...</To>
    <Sender>
      <Credential domain="NetworkId">
        <Identity>PunchoutGroup1556947794</Identity>
        <SharedSecret>pVn9bQwGGnl1KZ26VyblJJoXFJCXV2</SharedSecret>
      </Credential>
    </Sender>
  </Header>
  <Request>
    <PunchOutSetupRequest operation="create">
      <BuyerCookie>unique-session-id</BuyerCookie>
      <BrowserFormPost>
        <URL>http://localhost:3000/api/amazon-punchout/return</URL>
      </BrowserFormPost>
      ...
    </PunchOutSetupRequest>
  </Request>
</cXML>
```

### PunchOutOrderMessage (Received from Amazon)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<cXML>
  <Message>
    <PunchOutOrderMessage>
      <BuyerCookie>unique-session-id</BuyerCookie>
      <ItemIn quantity="2">
        <ItemID>
          <SupplierPartID>B08XYZ</SupplierPartID>
        </ItemID>
        <ItemDetail>
          <UnitPrice>
            <Money currency="USD">29.99</Money>
          </UnitPrice>
          <Description>Product Name</Description>
        </ItemDetail>
      </ItemIn>
    </PunchOutOrderMessage>
  </Message>
</cXML>
```

## Security Considerations

1. **Shared Secret**: The shared secret is used to authenticate with Amazon. Keep it secure.
2. **Session Tracking**: The BuyerCookie ensures items are added to the correct user's cart
3. **HTTPS**: Always use HTTPS in production for secure communication
4. **Input Validation**: The backend validates and sanitizes all XML input from Amazon

## Testing

### Test Mode

By default, `AMAZON_PUNCHOUT_USE_PROD=false` uses the Amazon test environment at:
`https://abintegrations.amazon.com/punchout/test`

### Testing Steps

1. Start the backend server: `cd backend && npm start`
2. Start the frontend: `cd frontend && npm start`
3. Log in to the application
4. Navigate to Marketplace
5. Click "Shop on Amazon Business"
6. You should be redirected to Amazon's test environment
7. Add items and return to ExpenseHub
8. Verify items appear in your cart

## Troubleshooting

### Items not appearing in cart

- Check the backend logs for errors in parsing the cXML response
- Verify the `buyer_cookie` matches between request and response
- Check that the Amazon vendor exists in the database

### Connection fails

- Verify your `AMAZON_PUNCHOUT_IDENTITY` and `AMAZON_PUNCHOUT_SECRET` are correct
- Check if you're using the correct URL (test vs production)
- Review Amazon Business integration status in your Amazon account

### Database errors

- Ensure the migration ran successfully
- Check that the `punchout_sessions` table exists
- Verify foreign key constraints (users, cost_centers) are satisfied

## Production Checklist

- [ ] Set `AMAZON_PUNCHOUT_USE_PROD=true`
- [ ] Update `FRONTEND_URL` to your production domain
- [ ] Verify SSL/TLS certificates are valid
- [ ] Test the integration end-to-end
- [ ] Set up monitoring for punchout sessions
- [ ] Configure Amazon Business return URL in their portal to your production callback URL
- [ ] Review and adjust security headers in server.js if needed

## Future Enhancements

- Cost center selection during punchout initiation
- Support for additional punchout vendors (Staples, Office Depot, etc.)
- Punchout session timeout handling
- Advanced order tracking and reconciliation
- Purchase order (PO) integration via cXML OrderRequest
const crypto = require('crypto');
const xml2js = require('xml2js');

class PunchoutService {
  
  /**
   * Generate cXML PunchOutSetupRequest
   */
  generateCxmlPunchoutRequest(vendorConfig, userId, userEmail, costCenter) {
    const timestamp = new Date().toISOString();
    const payloadId = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
    
    const cxmlRequest = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE cXML SYSTEM "http://xml.cxml.org/schemas/cXML/1.2.014/cXML.dtd">
<cXML payloadID="${payloadId}" timestamp="${timestamp}" xml:lang="en-US">
  <Header>
    <From>
      <Credential domain="DUNS">
        <Identity>${vendorConfig.fromIdentity}</Identity>
      </Credential>
    </From>
    <To>
      <Credential domain="NetworkId">
        <Identity>${vendorConfig.toIdentity}</Identity>
      </Credential>
    </To>
    <Sender>
      <Credential domain="NetworkId">
        <Identity>${vendorConfig.senderIdentity}</Identity>
        <SharedSecret>${vendorConfig.sharedSecret}</SharedSecret>
      </Credential>
      <UserAgent>ExpenseHub Procurement v1.0</UserAgent>
    </Sender>
  </Header>
  <Request deploymentMode="production">
    <PunchOutSetupRequest operation="create">
      <BuyerCookie>${userId}</BuyerCookie>
      <Extrinsic name="UserEmail">${userEmail}</Extrinsic>
      <Extrinsic name="CostCenter">${costCenter || ''}</Extrinsic>
      <Extrinsic name="UniqueName">${userId}</Extrinsic>
      <BrowserFormPost>
        <URL>${vendorConfig.returnUrl}</URL>
      </BrowserFormPost>
      <Contact role="endUser">
        <Name xml:lang="en-US">${userEmail}</Name>
        <Email>${userEmail}</Email>
      </Contact>
      <SupplierSetup>
        <URL>${vendorConfig.punchoutUrl}</URL>
      </SupplierSetup>
    </PunchOutSetupRequest>
  </Request>
</cXML>`;

    return cxmlRequest;
  }

  /**
   * Parse cXML PunchOutOrderMessage (return from vendor)
   */
  async parseCxmlReturn(cxmlResponse) {
    try {
      const parser = new xml2js.Parser({ explicitArray: false });
      const result = await parser.parseStringPromise(cxmlResponse);
      
      const itemsIn = result.cXML.Message.PunchOutOrderMessage.ItemIn;
      const items = Array.isArray(itemsIn) ? itemsIn : [itemsIn];
      
      const cartItems = items.map(item => ({
        quantity: parseInt(item.$.quantity),
        lineNumber: item.$.lineNumber,
        itemId: item.ItemID.SupplierPartID,
        description: item.ItemDetail.Description.ShortName || item.ItemDetail.Description._,
        unitPrice: parseFloat(item.ItemDetail.UnitPrice.Money._),
        currency: item.ItemDetail.UnitPrice.Money.$.currency,
        unitOfMeasure: item.ItemDetail.UnitOfMeasure,
        manufacturerPartId: item.ItemDetail?.ManufacturerPartID || '',
        manufacturerName: item.ItemDetail?.ManufacturerName || '',
        classification: item.ItemDetail?.Classification?._ || '',
        url: item.ItemDetail?.URL || '',
        leadTime: item.ItemDetail?.LeadTime || ''
      }));

      return {
        success: true,
        buyerCookie: result.cXML.Message.PunchOutOrderMessage.BuyerCookie,
        items: cartItems,
        totalAmount: cartItems.reduce((sum, item) => 
          sum + (item.quantity * item.unitPrice), 0
        )
      };
    } catch (error) {
      console.error('Error parsing cXML return:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generate OCI punchout URL (simpler protocol)
   */
  generateOciPunchoutUrl(vendorConfig, userId, userEmail, costCenter) {
    const params = new URLSearchParams({
      'HOOK_URL': vendorConfig.returnUrl,
      'USERNAME': userEmail,
      'FUNCTION': 'DETAIL',
      'CALLER': vendorConfig.senderIdentity,
      'COSTCENTER': costCenter || '',
      'ORDERID': `${userId}-${Date.now()}`
    });

    return `${vendorConfig.punchoutUrl}?${params.toString()}`;
  }

  /**
   * Parse OCI return parameters
   */
  parseOciReturn(queryParams) {
    const items = [];
    let index = 1;

    // OCI returns items as NEW_ITEM-DESCRIPTION[1], NEW_ITEM-QUANTITY[1], etc.
    while (queryParams[`NEW_ITEM-DESCRIPTION[${index}]`]) {
      items.push({
        description: queryParams[`NEW_ITEM-DESCRIPTION[${index}]`],
        quantity: parseInt(queryParams[`NEW_ITEM-QUANTITY[${index}]`]),
        unitPrice: parseFloat(queryParams[`NEW_ITEM-PRICE[${index}]`]),
        currency: queryParams[`NEW_ITEM-CURRENCY[${index}]`],
        unit: queryParams[`NEW_ITEM-UNIT[${index}]`],
        vendorMat: queryParams[`NEW_ITEM-VENDORMAT[${index}]`],
        manufacturerName: queryParams[`NEW_ITEM-MANUFACTNAME[${index}]`] || '',
        manufacturerPartId: queryParams[`NEW_ITEM-MANUFACTMAT[${index}]`] || '',
        leadTime: queryParams[`NEW_ITEM-LEADTIME[${index}]`] || ''
      });
      index++;
    }

    return {
      success: items.length > 0,
      items,
      totalAmount: items.reduce((sum, item) => 
        sum + (item.quantity * item.unitPrice), 0
      )
    };
  }

  /**
   * Create HTML form for auto-posting cXML to vendor
   */
  createPunchoutForm(vendorUrl, cxmlRequest) {
    return `
<!DOCTYPE html>
<html>
<head>
  <title>Redirecting to Vendor...</title>
</head>
<body>
  <p>Connecting to vendor catalog...</p>
  <form id="punchoutForm" method="POST" action="${vendorUrl}">
    <input type="hidden" name="cxml-urlencoded" value="${encodeURIComponent(cxmlRequest)}" />
  </form>
  <script>
    document.getElementById('punchoutForm').submit();
  </script>
</body>
</html>`;
  }

  /**
   * Validate vendor credentials
   */
  validateVendorConfig(vendorConfig) {
    const required = ['punchoutUrl', 'fromIdentity', 'toIdentity', 'senderIdentity', 'returnUrl'];
    const missing = required.filter(field => !vendorConfig[field]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required vendor configuration: ${missing.join(', ')}`);
    }
    
    return true;
  }
}

module.exports = new PunchoutService();

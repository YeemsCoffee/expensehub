const crypto = require('crypto');
const xml2js = require('xml2js');

class PunchoutService {
  
  /**
   * Generate cXML PunchOutSetupRequest
   */
  generateCxmlPunchoutRequest(vendorConfig, userId, userEmail, costCenter) {
    const timestamp = new Date().toISOString();
    const payloadId = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;

    // Amazon Business uses NetworkId domain, not DUNS
    const fromDomain = vendorConfig.fromDomain || 'NetworkId';
    const toDomain = vendorConfig.toDomain || 'NetworkId';
    const deploymentMode = process.env.AMAZON_PUNCHOUT_MODE === 'test' ? 'test' : 'production';

    // Escape XML special characters
    const escapeXml = (str) => {
      if (!str && str !== 0) return '';
      const stringValue = String(str);
      return stringValue.replace(/[<>&'"]/g, (c) => {
        switch (c) {
          case '<': return '&lt;';
          case '>': return '&gt;';
          case '&': return '&amp;';
          case "'": return '&apos;';
          case '"': return '&quot;';
          default: return c;
        }
      });
    };

    const cxmlRequest = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE cXML SYSTEM "http://xml.cxml.org/schemas/cXML/1.2.014/cXML.dtd">
<cXML payloadID="${payloadId}" timestamp="${timestamp}" xml:lang="en-US">
  <Header>
    <From>
      <Credential domain="${fromDomain}">
        <Identity>${escapeXml(vendorConfig.fromIdentity)}</Identity>
      </Credential>
    </From>
    <To>
      <Credential domain="${toDomain}">
        <Identity>${escapeXml(vendorConfig.toIdentity)}</Identity>
      </Credential>
    </To>
    <Sender>
      <Credential domain="${fromDomain}">
        <Identity>${escapeXml(vendorConfig.senderIdentity)}</Identity>
        <SharedSecret>${escapeXml(vendorConfig.sharedSecret)}</SharedSecret>
      </Credential>
      <UserAgent>ExpenseHub Procurement v1.0</UserAgent>
    </Sender>
  </Header>
  <Request deploymentMode="${deploymentMode}">
    <PunchOutSetupRequest operation="create">
      <BuyerCookie>${escapeXml(userId)}</BuyerCookie>
      <Extrinsic name="UserEmail">${escapeXml(userEmail)}</Extrinsic>
      <Extrinsic name="UniqueName">${escapeXml(userId)}</Extrinsic>
      ${costCenter ? `<Extrinsic name="CostCenter">${escapeXml(costCenter)}</Extrinsic>` : ''}
      <BrowserFormPost>
        <URL>${escapeXml(vendorConfig.returnUrl)}</URL>
      </BrowserFormPost>
      <Contact role="endUser">
        <Name xml:lang="en-US">${escapeXml(userEmail)}</Name>
        <Email>${escapeXml(userEmail)}</Email>
      </Contact>
    </PunchOutSetupRequest>
  </Request>
</cXML>`;

    // Log the request for debugging
    console.log('=== cXML PunchOut Request ===');
    console.log('Timestamp:', timestamp);
    console.log('PayloadID:', payloadId);
    console.log('From Domain:', fromDomain);
    console.log('From Identity:', vendorConfig.fromIdentity);
    console.log('To Domain:', toDomain);
    console.log('To Identity:', vendorConfig.toIdentity);
    console.log('Sender Identity:', vendorConfig.senderIdentity);
    console.log('Shared Secret:', vendorConfig.sharedSecret ? `***${vendorConfig.sharedSecret.substring(0, 4)}***` : 'MISSING');
    console.log('Deployment Mode:', deploymentMode);
    console.log('Return URL:', vendorConfig.returnUrl);
    console.log('\nFull cXML (first 500 chars):');
    console.log(cxmlRequest.substring(0, 500) + '...');
    console.log('\n' + '='.repeat(50));
    console.log('IMPORTANT: Check that your credentials match what Amazon provided');
    console.log('- fromIdentity should be your company identifier from Amazon');
    console.log('- toIdentity should be "Amazon" (as per Amazon documentation)');
    console.log('- sharedSecret should be the secret Amazon provided');
    console.log('- returnUrl should be accessible from the internet');
    console.log('='.repeat(50));

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
    console.log('=== Creating Punchout Form ===');
    console.log('Vendor URL:', vendorUrl);
    console.log('URL is undefined?', vendorUrl === undefined);
    console.log('==============================');

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
    console.log('Form action URL:', '${vendorUrl}');
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

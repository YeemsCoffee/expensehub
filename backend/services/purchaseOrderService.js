const crypto = require('crypto');

class PurchaseOrderService {

  /**
   * Generate OAG (Open Applications Group) Purchase Order
   * Used by Amazon Business for actual order submission
   */
  generateOagPurchaseOrder(vendorConfig, orderData, userInfo) {
    const timestamp = new Date().toISOString();
    const orderId = `PO-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    // Calculate totals
    const subtotal = orderData.items.reduce((sum, item) =>
      sum + (item.quantity * item.unitPrice), 0
    );
    const tax = subtotal * (orderData.taxRate || 0);
    const shipping = orderData.shippingCost || 0;
    const total = subtotal + tax + shipping;

    const oagXml = `<?xml version="1.0" encoding="UTF-8"?>
<PurchaseOrder xmlns="http://www.openapplications.org/oagis/9">
  <ApplicationArea>
    <Sender>
      <LogicalID>${vendorConfig.senderIdentity}</LogicalID>
      <ComponentID>ExpenseHub</ComponentID>
      <ConfirmationCode>${vendorConfig.sharedSecret}</ConfirmationCode>
    </Sender>
    <CreationDateTime>${timestamp}</CreationDateTime>
    <BODID>${orderId}</BODID>
  </ApplicationArea>
  <DataArea>
    <Process>
      <ActionCriteria>
        <ActionExpression actionCode="Add"/>
      </ActionCriteria>
    </Process>
    <PurchaseOrder>
      <PurchaseOrderHeader>
        <ID>${orderId}</ID>
        <Name>ExpenseHub Order</Name>
        <DocumentDateTime>${timestamp}</DocumentDateTime>
        <Status>
          <Code>New</Code>
        </Status>
        <BuyerParty>
          <PartyIDs>
            <ID>${vendorConfig.fromIdentity}</ID>
          </PartyIDs>
          <Name>${orderData.companyName || 'Yeems Coffee'}</Name>
          <Contacts>
            <Contact>
              <Name>${userInfo.firstName} ${userInfo.lastName}</Name>
              <EmailAddress>${userInfo.email}</EmailAddress>
            </Contact>
          </Contacts>
        </BuyerParty>
        <SupplierParty>
          <PartyIDs>
            <ID>${vendorConfig.toIdentity}</ID>
          </PartyIDs>
        </SupplierParty>
        <ShipToParty>
          <Name>${orderData.shipTo?.name || orderData.companyName}</Name>
          <Addresses>
            <Address>
              <LineOne>${orderData.shipTo?.address1 || ''}</LineOne>
              <LineTwo>${orderData.shipTo?.address2 || ''}</LineTwo>
              <CityName>${orderData.shipTo?.city || ''}</CityName>
              <StateOrProvince>${orderData.shipTo?.state || ''}</StateOrProvince>
              <PostalCode>${orderData.shipTo?.zip || ''}</PostalCode>
              <CountryCode>${orderData.shipTo?.country || 'US'}</CountryCode>
            </Address>
          </Addresses>
        </ShipToParty>
        <TotalAmount>
          <Amount currencyID="${orderData.currency || 'USD'}">${total.toFixed(2)}</Amount>
        </TotalAmount>
      </PurchaseOrderHeader>
${this.generateOagLineItems(orderData.items, orderData.currency)}
    </PurchaseOrder>
  </DataArea>
</PurchaseOrder>`;

    return oagXml;
  }

  /**
   * Generate line items for OAG PO
   */
  generateOagLineItems(items, currency = 'USD') {
    return items.map((item, index) => {
      const lineNumber = index + 1;
      const lineTotal = item.quantity * item.unitPrice;

      return `      <PurchaseOrderLine>
        <LineNumber>${lineNumber}</LineNumber>
        <Item>
          <ItemID>
            <ID>${item.itemId || item.sku}</ID>
          </ItemID>
          <Description>${this.escapeXml(item.description || item.name)}</Description>
          <ManufacturerParty>
            <Name>${this.escapeXml(item.manufacturerName || '')}</Name>
            <ManufacturerItemID>
              <ID>${item.manufacturerPartId || ''}</ID>
            </ManufacturerItemID>
          </ManufacturerParty>
        </Item>
        <Quantity unitCode="${item.unitOfMeasure || 'EA'}">${item.quantity}</Quantity>
        <UnitPrice>
          <Amount currencyID="${currency}">${item.unitPrice.toFixed(2)}</Amount>
        </UnitPrice>
        <ExtendedAmount>
          <Amount currencyID="${currency}">${lineTotal.toFixed(2)}</Amount>
        </ExtendedAmount>
        <RequestedDeliveryDateTime>${item.requestedDate || new Date().toISOString()}</RequestedDeliveryDateTime>
      </PurchaseOrderLine>`;
    }).join('\n');
  }

  /**
   * Generate cXML OrderRequest (alternative to OAG)
   */
  generateCxmlOrderRequest(vendorConfig, orderData, userInfo) {
    const timestamp = new Date().toISOString();
    const orderId = `PO-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const payloadId = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;

    const subtotal = orderData.items.reduce((sum, item) =>
      sum + (item.quantity * item.unitPrice), 0
    );
    const tax = subtotal * (orderData.taxRate || 0);
    const shipping = orderData.shippingCost || 0;
    const total = subtotal + tax + shipping;

    const cxmlOrder = `<?xml version="1.0" encoding="UTF-8"?>
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
      <UserAgent>ExpenseHub v1.0</UserAgent>
    </Sender>
  </Header>
  <Request>
    <OrderRequest>
      <OrderRequestHeader orderID="${orderId}" orderDate="${timestamp}">
        <Total>
          <Money currency="${orderData.currency || 'USD'}">${total.toFixed(2)}</Money>
        </Total>
        <ShipTo>
          <Address>
            <Name xml:lang="en">${orderData.shipTo?.name || orderData.companyName}</Name>
            <PostalAddress>
              <Street>${orderData.shipTo?.address1 || ''}</Street>
              <City>${orderData.shipTo?.city || ''}</City>
              <State>${orderData.shipTo?.state || ''}</State>
              <PostalCode>${orderData.shipTo?.zip || ''}</PostalCode>
              <Country isoCountryCode="${orderData.shipTo?.country || 'US'}">${orderData.shipTo?.country || 'US'}</Country>
            </PostalAddress>
          </Address>
        </ShipTo>
        <BillTo>
          <Address>
            <Name xml:lang="en">${orderData.billTo?.name || orderData.companyName}</Name>
          </Address>
        </BillTo>
        <Contact role="orderContact">
          <Name xml:lang="en">${userInfo.firstName} ${userInfo.lastName}</Name>
          <Email>${userInfo.email}</Email>
        </Contact>
      </OrderRequestHeader>
${this.generateCxmlItemsOut(orderData.items, orderData.currency)}
    </OrderRequest>
  </Request>
</cXML>`;

    return cxmlOrder;
  }

  /**
   * Generate cXML ItemOut elements
   */
  generateCxmlItemsOut(items, currency = 'USD') {
    return items.map((item, index) => {
      const lineNumber = index + 1;
      const lineTotal = item.quantity * item.unitPrice;

      return `      <ItemOut quantity="${item.quantity}" lineNumber="${lineNumber}">
        <ItemID>
          <SupplierPartID>${item.itemId || item.sku}</SupplierPartID>
        </ItemID>
        <ItemDetail>
          <UnitPrice>
            <Money currency="${currency}">${item.unitPrice.toFixed(2)}</Money>
          </UnitPrice>
          <Description xml:lang="en">${this.escapeXml(item.description || item.name)}</Description>
          <UnitOfMeasure>${item.unitOfMeasure || 'EA'}</UnitOfMeasure>
          ${item.manufacturerPartId ? `<ManufacturerPartID>${item.manufacturerPartId}</ManufacturerPartID>` : ''}
          ${item.manufacturerName ? `<ManufacturerName>${this.escapeXml(item.manufacturerName)}</ManufacturerName>` : ''}
        </ItemDetail>
      </ItemOut>`;
    }).join('\n');
  }

  /**
   * Escape XML special characters
   */
  escapeXml(unsafe) {
    if (!unsafe) return '';
    return unsafe.toString()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Send purchase order to vendor
   */
  async submitPurchaseOrder(vendorConfig, orderXml, format = 'oag') {
    try {
      const response = await fetch(vendorConfig.poUrl, {
        method: 'POST',
        headers: {
          'Content-Type': format === 'oag'
            ? 'application/xml'
            : 'application/x-www-form-urlencoded',
        },
        body: format === 'oag'
          ? orderXml
          : `cxml-urlencoded=${encodeURIComponent(orderXml)}`
      });

      if (!response.ok) {
        throw new Error(`PO submission failed: ${response.statusText}`);
      }

      const responseText = await response.text();
      return {
        success: true,
        response: responseText
      };
    } catch (error) {
      console.error('Purchase order submission error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new PurchaseOrderService();

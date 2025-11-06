const Client = require('@veryfi/veryfi-sdk');
const fs = require('fs').promises;

class VeryfiService {
  constructor() {
    // Initialize Veryfi client with credentials from environment
    this.client = new Client(
      process.env.VERYFI_CLIENT_ID,
      process.env.VERYFI_CLIENT_SECRET,
      process.env.VERYFI_USERNAME,
      process.env.VERYFI_API_KEY
    );
  }

  /**
   * Process receipt image and extract structured data
   * @param {string} filePath - Path to receipt image file
   * @param {string} fileName - Original file name
   * @returns {Promise<Object>} Extracted receipt data
   */
  async processReceipt(filePath, fileName) {
    try {
      console.log(`Processing receipt: ${fileName}`);
      console.log(`File path: ${filePath}`);

      // Read file as base64 for Veryfi API
      const fileBuffer = await fs.readFile(filePath);
      const base64Image = fileBuffer.toString('base64');
      console.log(`File read successfully, size: ${fileBuffer.length} bytes`);

      // Process with Veryfi
      console.log('Calling Veryfi API...');
      const result = await this.client.process_document(
        fileName,
        base64Image,
        null, // Categories (optional)
        true  // Delete after processing
      );

      console.log('Veryfi processing complete:', {
        id: result.id,
        vendor: result.vendor?.name,
        total: result.total,
        date: result.date
      });

      // Map Veryfi response to our expense structure
      const mappedData = this.mapVeryfiToExpense(result);

      return {
        success: true,
        data: mappedData,
        raw: result, // Include raw response for debugging
        confidence: {
          vendor: result.vendor?.confidence || 0,
          total: result.total_confidence || 0,
          date: result.date_confidence || 0
        }
      };

    } catch (error) {
      console.error('Veryfi processing error - Full details:', {
        message: error.message,
        name: error.name,
        stack: error.stack,
        response: error.response?.data,
        status: error.response?.status
      });

      // Return more detailed error for debugging
      return {
        success: false,
        error: error.message || 'Failed to process receipt',
        details: error.response?.data || error.stack || null,
        statusCode: error.response?.status
      };
    }
  }

  /**
   * Map Veryfi response to ExpenseHub expense format
   * @param {Object} veryfiData - Raw Veryfi API response
   * @returns {Object} Mapped expense data
   */
  mapVeryfiToExpense(veryfiData) {
    // Extract line items
    const lineItems = (veryfiData.line_items || []).map(item => ({
      description: item.description || item.title,
      quantity: item.quantity || 1,
      unitPrice: item.price || 0,
      total: item.total || item.price || 0
    }));

    // Determine category based on vendor or line items
    const category = this.inferCategory(veryfiData);

    // Calculate tax
    const tax = veryfiData.tax || 0;
    const subtotal = veryfiData.subtotal || (veryfiData.total - tax);

    return {
      // Basic expense fields
      vendor: veryfiData.vendor?.name || 'Unknown Vendor',
      date: veryfiData.date || new Date().toISOString().split('T')[0],
      amount: veryfiData.total || 0,
      category: category,

      // Additional details
      description: this.generateDescription(veryfiData),
      notes: veryfiData.notes || '',

      // Financial breakdown
      subtotal: subtotal,
      tax: tax,
      tip: veryfiData.tip || 0,

      // Line items
      lineItems: lineItems,

      // Payment info
      paymentMethod: veryfiData.payment?.type || veryfiData.payment_type,
      cardLastFour: veryfiData.payment?.card_number?.slice(-4),

      // Receipt metadata
      receiptNumber: veryfiData.receipt_number || veryfiData.invoice_number,
      currency: veryfiData.currency_code || 'USD',

      // Vendor details
      vendorDetails: {
        name: veryfiData.vendor?.name,
        address: veryfiData.vendor?.address,
        phone: veryfiData.vendor?.phone_number,
        category: veryfiData.vendor?.category,
        vendorRegNumber: veryfiData.vendor?.reg_number,
        vendorTaxNumber: veryfiData.vendor?.vat_number
      },

      // Original Veryfi ID for reference
      veryfiId: veryfiData.id,
      veryfiUrl: veryfiData.pdf_url
    };
  }

  /**
   * Infer expense category from receipt data
   * @param {Object} veryfiData - Veryfi API response
   * @returns {string} Expense category
   */
  inferCategory(veryfiData) {
    const vendorName = (veryfiData.vendor?.name || '').toLowerCase();
    const vendorCategory = (veryfiData.vendor?.category || '').toLowerCase();

    // Category mapping based on vendor name or category
    const categoryMap = {
      // Meals & Entertainment
      'meals': ['restaurant', 'cafe', 'coffee', 'food', 'dining', 'pizza', 'burger'],
      'meals_entertainment': ['bar', 'pub', 'entertainment', 'theater', 'cinema'],

      // Travel
      'travel': ['hotel', 'motel', 'inn', 'lodging', 'airbnb', 'uber', 'lyft', 'taxi', 'airline', 'flight'],
      'car_rental': ['rental', 'hertz', 'enterprise', 'avis', 'budget'],
      'fuel': ['gas', 'fuel', 'petrol', 'shell', 'chevron', 'exxon', 'bp'],

      // Office
      'office_supplies': ['office', 'staples', 'depot', 'supplies'],

      // IT & Software
      'software': ['software', 'saas', 'subscription', 'microsoft', 'adobe', 'google'],
      'equipment': ['electronics', 'computer', 'laptop', 'apple', 'dell', 'hp'],

      // Services
      'professional_services': ['consulting', 'legal', 'accounting', 'services'],
      'marketing': ['marketing', 'advertising', 'promotion'],

      // Utilities
      'internet': ['internet', 'wifi', 'broadband'],
      'utilities': ['utility', 'electric', 'water', 'power']
    };

    // Check vendor name against categories
    for (const [category, keywords] of Object.entries(categoryMap)) {
      if (keywords.some(keyword => vendorName.includes(keyword) || vendorCategory.includes(keyword))) {
        return category;
      }
    }

    // Default to "Other" if no match
    return 'other';
  }

  /**
   * Generate a concise description from receipt data
   * @param {Object} veryfiData - Veryfi API response
   * @returns {string} Generated description
   */
  generateDescription(veryfiData) {
    const vendor = veryfiData.vendor?.name || 'Unknown Vendor';
    const date = veryfiData.date || 'unknown date';
    const itemCount = veryfiData.line_items?.length || 0;

    if (itemCount > 0) {
      const firstItem = veryfiData.line_items[0].description || veryfiData.line_items[0].title;
      if (itemCount === 1) {
        return `${firstItem} from ${vendor}`;
      } else {
        return `${firstItem} and ${itemCount - 1} other item${itemCount > 2 ? 's' : ''} from ${vendor}`;
      }
    }

    return `Purchase from ${vendor} on ${date}`;
  }

  /**
   * Get document by Veryfi ID
   * @param {string} veryfiId - Veryfi document ID
   * @returns {Promise<Object>} Document data
   */
  async getDocument(veryfiId) {
    try {
      const result = await this.client.get_document(veryfiId);
      return { success: true, data: result };
    } catch (error) {
      console.error('Error fetching Veryfi document:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete document from Veryfi
   * @param {string} veryfiId - Veryfi document ID
   * @returns {Promise<Object>} Deletion result
   */
  async deleteDocument(veryfiId) {
    try {
      await this.client.delete_document(veryfiId);
      return { success: true };
    } catch (error) {
      console.error('Error deleting Veryfi document:', error);
      return { success: false, error: error.message };
    }
  }
}

// Export singleton instance
module.exports = new VeryfiService();

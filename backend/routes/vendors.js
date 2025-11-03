const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authMiddleware } = require('../middleware/auth');

// Get all active vendors with their products
router.get('/', authMiddleware, async (req, res) => {
  try {
    const vendorsResult = await db.query(
      `SELECT id, name, category, rating, contact_email, contact_phone
       FROM vendors 
       WHERE is_active = true
       ORDER BY name`
    );

    const vendors = vendorsResult.rows;

    // Get products for each vendor
    for (let vendor of vendors) {
      const productsResult = await db.query(
        `SELECT id, name, description, price, sku
         FROM products
         WHERE vendor_id = $1 AND is_active = true
         ORDER BY name`,
        [vendor.id]
      );
      vendor.products = productsResult.rows;
    }

    res.json(vendors);
  } catch (error) {
    console.error('Fetch vendors error:', error);
    res.status(500).json({ error: 'Server error fetching vendors' });
  }
});

// Get single vendor with products
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const vendorResult = await db.query(
      `SELECT id, name, category, rating, contact_email, contact_phone
       FROM vendors 
       WHERE id = $1 AND is_active = true`,
      [req.params.id]
    );

    if (vendorResult.rows.length === 0) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    const vendor = vendorResult.rows[0];

    // Get products
    const productsResult = await db.query(
      `SELECT id, name, description, price, sku
       FROM products
       WHERE vendor_id = $1 AND is_active = true
       ORDER BY name`,
      [vendor.id]
    );

    vendor.products = productsResult.rows;

    res.json(vendor);
  } catch (error) {
    console.error('Fetch vendor error:', error);
    res.status(500).json({ error: 'Server error fetching vendor' });
  }
});

// Search products across all vendors
router.get('/products/search', authMiddleware, async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'Search query required' });
    }

    const result = await db.query(
      `SELECT p.id, p.name, p.description, p.price, p.sku,
              v.id as vendor_id, v.name as vendor_name, v.category as vendor_category
       FROM products p
       JOIN vendors v ON p.vendor_id = v.id
       WHERE p.is_active = true 
         AND v.is_active = true
         AND (p.name ILIKE $1 OR p.description ILIKE $1)
       ORDER BY p.name
       LIMIT 50`,
      [`%${q}%`]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Search products error:', error);
    res.status(500).json({ error: 'Server error searching products' });
  }
});

module.exports = router;

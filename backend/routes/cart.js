const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authMiddleware } = require('../middleware/auth');

// Get user's cart
router.get('/', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT ci.id, ci.quantity, ci.cost_center_id,
              p.id as product_id, p.name as product_name, p.price,
              v.id as vendor_id, v.name as vendor_name,
              cc.code as cost_center_code, cc.name as cost_center_name
       FROM cart_items ci
       JOIN products p ON ci.product_id = p.id
       JOIN vendors v ON p.vendor_id = v.id
       LEFT JOIN cost_centers cc ON ci.cost_center_id = cc.id
       WHERE ci.user_id = $1
       ORDER BY ci.created_at DESC`,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Fetch cart error:', error);
    res.status(500).json({ error: 'Server error fetching cart' });
  }
});

// Add item to cart
router.post('/', authMiddleware, [
  body('productId').isInt(),
  body('quantity').isInt({ min: 1 }),
  body('costCenterId').optional().isInt()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { productId, quantity, costCenterId } = req.body;

    // Check if product exists and is active
    const productCheck = await db.query(
      'SELECT id FROM products WHERE id = $1 AND is_active = true',
      [productId]
    );

    if (productCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found or inactive' });
    }

    // Check if item already in cart
    const existingItem = await db.query(
      'SELECT id, quantity FROM cart_items WHERE user_id = $1 AND product_id = $2',
      [req.user.id, productId]
    );

    let result;
    if (existingItem.rows.length > 0) {
      // Update quantity
      result = await db.query(
        `UPDATE cart_items 
         SET quantity = quantity + $1,
             cost_center_id = COALESCE($2, cost_center_id),
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $3 AND product_id = $4
         RETURNING *`,
        [quantity, costCenterId, req.user.id, productId]
      );
    } else {
      // Add new item
      result = await db.query(
        `INSERT INTO cart_items (user_id, product_id, quantity, cost_center_id)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [req.user.id, productId, quantity, costCenterId]
      );
    }

    res.status(201).json({
      message: 'Item added to cart',
      cartItem: result.rows[0]
    });
  } catch (error) {
    console.error('Add to cart error:', error);
    res.status(500).json({ error: 'Server error adding to cart' });
  }
});

// Update cart item quantity
router.put('/:id', authMiddleware, [
  body('quantity').isInt({ min: 0 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { quantity } = req.body;

    if (quantity === 0) {
      // Remove item if quantity is 0
      await db.query(
        'DELETE FROM cart_items WHERE id = $1 AND user_id = $2',
        [req.params.id, req.user.id]
      );
      return res.json({ message: 'Item removed from cart' });
    }

    const result = await db.query(
      `UPDATE cart_items 
       SET quantity = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND user_id = $3
       RETURNING *`,
      [quantity, req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Cart item not found' });
    }

    res.json({
      message: 'Cart updated',
      cartItem: result.rows[0]
    });
  } catch (error) {
    console.error('Update cart error:', error);
    res.status(500).json({ error: 'Server error updating cart' });
  }
});

// Remove item from cart
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      'DELETE FROM cart_items WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Cart item not found' });
    }

    res.json({ message: 'Item removed from cart' });
  } catch (error) {
    console.error('Remove from cart error:', error);
    res.status(500).json({ error: 'Server error removing from cart' });
  }
});

// Clear cart
router.delete('/', authMiddleware, async (req, res) => {
  try {
    await db.query('DELETE FROM cart_items WHERE user_id = $1', [req.user.id]);
    res.json({ message: 'Cart cleared' });
  } catch (error) {
    console.error('Clear cart error:', error);
    res.status(500).json({ error: 'Server error clearing cart' });
  }
});

// Checkout (submit cart as order/expense)
router.post('/checkout', authMiddleware, [
  body('costCenterId').isInt()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { costCenterId } = req.body;

    // Get cart items
    const cartResult = await db.query(
      `SELECT ci.quantity, p.id as product_id, p.name, p.price, v.name as vendor_name
       FROM cart_items ci
       JOIN products p ON ci.product_id = p.id
       JOIN vendors v ON p.vendor_id = v.id
       WHERE ci.user_id = $1`,
      [req.user.id]
    );

    if (cartResult.rows.length === 0) {
      return res.status(400).json({ error: 'Cart is empty' });
    }

    // Create expenses for each cart item
    const expenses = [];
    for (const item of cartResult.rows) {
      const amount = item.price * item.quantity;
      const description = `${item.vendor_name} - ${item.name} (Qty: ${item.quantity})`;
      
      const expenseResult = await db.query(
        `INSERT INTO expenses (user_id, cost_center_id, date, description, category, amount)
         VALUES ($1, $2, CURRENT_DATE, $3, 'Office Supplies', $4)
         RETURNING *`,
        [req.user.id, costCenterId, description, amount]
      );
      
      expenses.push(expenseResult.rows[0]);
    }

    // Clear cart
    await db.query('DELETE FROM cart_items WHERE user_id = $1', [req.user.id]);

    res.json({
      message: 'Order submitted for approval',
      expenses
    });
  } catch (error) {
    console.error('Checkout error:', error);
    res.status(500).json({ error: 'Server error during checkout' });
  }
});

module.exports = router;

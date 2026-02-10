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
  body('costCenterId').isInt(),
  body('locationId').isInt()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { costCenterId, locationId } = req.body;

    // Get cart items including Amazon SPAID for order placement
    const cartResult = await db.query(
      `SELECT ci.quantity, ci.amazon_spaid, p.id as product_id, p.name, p.price, v.name as vendor_name, v.id as vendor_id
       FROM cart_items ci
       JOIN products p ON ci.product_id = p.id
       JOIN vendors v ON p.vendor_id = v.id
       WHERE ci.user_id = $1`,
      [req.user.id]
    );

    if (cartResult.rows.length === 0) {
      return res.status(400).json({ error: 'Cart is empty' });
    }

    // Determine approval requirements for cart items
    // Use the same logic as regular expense creation to check approval rules and manager chains
    // We'll calculate the total amount to determine the approval rule
    const totalAmount = cartResult.rows.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    console.log(`Cart checkout for user ${req.user.id}: ${cartResult.rows.length} items, total amount: $${totalAmount}`);

    // Find applicable approval rule based on total amount
    const ruleResult = await db.query(
      'SELECT * FROM find_approval_rule($1, $2)',
      [totalAmount, costCenterId]
    );

    let approvalChain = null;
    let approvalRuleId = null;
    let currentApprovalLevel = 1;

    if (ruleResult.rows[0] && ruleResult.rows[0].find_approval_rule) {
      approvalRuleId = ruleResult.rows[0].find_approval_rule;

      // Get the rule details
      const rule = await db.query(
        'SELECT * FROM approval_rules WHERE id = $1',
        [approvalRuleId]
      );

      if (rule.rows.length > 0) {
        const levelsRequired = rule.rows[0].levels_required;

        // Get manager chain from org chart
        const chainResult = await db.query(
          'SELECT * FROM get_manager_chain($1, $2)',
          [req.user.id, levelsRequired]
        );

        if (chainResult.rows.length > 0) {
          // Build approval chain with manager details
          approvalChain = chainResult.rows.map(row => ({
            level: row.level,
            user_id: row.manager_id,
            user_name: row.manager_name,
            user_email: row.manager_email,
            status: 'pending'
          }));
          console.log(`User ${req.user.id} has complete manager chain (${chainResult.rows.length} levels). Status: pending`);
        } else {
          // No complete manager chain found - auto-approve
          console.log(`User ${req.user.id} has no complete manager chain for ${levelsRequired} levels. Status: approved (auto)`);
          approvalRuleId = null;
          approvalChain = null;
        }
      }
    } else {
      // No approval rule found - auto-approve
      console.log(`No approval rule found for amount $${totalAmount}. Status: approved (auto)`);
    }

    const status = approvalChain ? 'pending' : 'approved';
    const approvedAt = approvalChain ? null : new Date();

    // Create expenses for each cart item
    const expenses = [];
    for (const item of cartResult.rows) {
      const amount = item.price * item.quantity;
      const description = `${item.name} (Qty: ${item.quantity})`;

      // Determine category based on vendor
      let category = 'Office Supplies';
      if (item.vendor_name.toLowerCase().includes('amazon')) {
        category = 'Office Supplies';
      }

      // Store Amazon SPAID if present (needed for order placement)
      const amazonSpaid = item.amazon_spaid || null;
      const amazonOrderStatus = amazonSpaid ? 'pending' : null;

      const expenseResult = await db.query(
        `INSERT INTO expenses (user_id, cost_center_id, location_id, date, description, category, amount, vendor_name, cost_type, status, approved_at, amazon_spaid, amazon_order_status, approval_rule_id, approval_chain, current_approval_level)
         VALUES ($1, $2, $3, CURRENT_DATE, $4, $5, $6, $7, 'OPEX', $8, $9, $10, $11, $12, $13, $14)
         RETURNING *`,
        [req.user.id, costCenterId, locationId, description, category, amount, item.vendor_name, status, approvedAt, amazonSpaid, amazonOrderStatus, approvalRuleId, approvalChain ? JSON.stringify(approvalChain) : null, currentApprovalLevel]
      );

      expenses.push(expenseResult.rows[0]);
    }

    // Clear cart
    await db.query('DELETE FROM cart_items WHERE user_id = $1', [req.user.id]);

    console.log(`Cart checkout: Created ${expenses.length} expense(s) for user ${req.user.id}, status: ${status}`);

    // Send email notification to the first approver in the chain (non-blocking)
    if (approvalChain && approvalChain.length > 0) {
      setImmediate(async () => {
        try {
          const { sendExpenseSubmissionNotification } = require('../services/emailService');
          const firstApprover = approvalChain[0];

          // Get submitter name from database
          const submitterResult = await db.query(
            'SELECT first_name, last_name FROM users WHERE id = $1',
            [req.user.id]
          );
          const submitter = submitterResult.rows[0];

          // Send notification for each expense
          for (const expense of expenses) {
            const expenseData = {
              id: expense.id,
              date: expense.date,
              amount: expense.amount,
              category: expense.category,
              description: expense.description,
              vendor_name: expense.vendor_name,
              notes: expense.notes
            };
            const managerData = {
              name: firstApprover.user_name,
              email: firstApprover.user_email
            };
            const submitterData = {
              name: `${submitter.first_name} ${submitter.last_name}`
            };

            await sendExpenseSubmissionNotification(expenseData, managerData, submitterData)
              .catch(err => console.error('Failed to send approval notification:', err));
          }
        } catch (err) {
          console.error('Error sending approval notifications:', err);
        }
      });
    }

    // If auto-approved and has Amazon items, send orders to Amazon
    if (!approvalChain) {
      const { sendOrderToAmazon } = require('./amazonPunchout');

      for (const expense of expenses) {
        if (expense.amazon_spaid && expense.amazon_order_status === 'pending') {
          // Send order asynchronously (non-blocking)
          setImmediate(async () => {
            try {
              console.log(`🛒 [Amazon Order] Auto-approved - placing order for expense ${expense.id} with SPAID:`, expense.amazon_spaid);

              // Get user and location info for order
              const [userResult, locationResult] = await Promise.all([
                db.query('SELECT email, first_name, last_name FROM users WHERE id = $1', [req.user.id]),
                db.query('SELECT * FROM locations WHERE id = $1', [expense.location_id])
              ]);
              const user = userResult.rows[0];
              const location = locationResult.rows[0];

              const orderResult = await sendOrderToAmazon(expense, {
                email: user.email,
                name: `${user.first_name} ${user.last_name}`,
                location: location
              });

              if (orderResult.success) {
                console.log(`✓ [Amazon Order] Order placed successfully! PO Number: ${orderResult.poNumber}`);

                await db.query(
                  `UPDATE expenses
                   SET amazon_po_number = $1,
                       amazon_order_status = 'confirmed',
                       amazon_order_sent_at = CURRENT_TIMESTAMP,
                       updated_at = CURRENT_TIMESTAMP
                   WHERE id = $2`,
                  [orderResult.poNumber, expense.id]
                );
              } else {
                console.error(`✗ [Amazon Order] Failed to place order for expense ${expense.id}:`, orderResult.error);

                await db.query(
                  `UPDATE expenses
                   SET amazon_order_status = 'failed',
                       amazon_order_sent_at = CURRENT_TIMESTAMP,
                       updated_at = CURRENT_TIMESTAMP
                   WHERE id = $1`,
                  [expense.id]
                );
              }
            } catch (orderError) {
              console.error(`Error placing Amazon order for expense ${expense.id}:`, orderError);

              await db.query(
                `UPDATE expenses
                 SET amazon_order_status = 'failed',
                     amazon_order_sent_at = CURRENT_TIMESTAMP,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1`,
                [expense.id]
              );
            }
          });
        }
      }
    }

    res.json({
      message: approvalChain ? 'Expense reports submitted for approval' : 'Expense reports automatically approved',
      expenses,
      count: expenses.length,
      autoApproved: !approvalChain
    });
  } catch (error) {
    console.error('Checkout error:', error);
    res.status(500).json({ error: 'Server error during checkout' });
  }
});

module.exports = router;

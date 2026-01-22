/**
 * Script to approve pending Amazon orders and trigger order placement
 * Usage: node approve-pending-amazon-orders.js [user_id]
 */

const db = require('./config/database');
const { sendOrderToAmazon } = require('./routes/amazonPunchout');

async function approvePendingAmazonOrders(userId) {
  try {
    console.log('🔍 Searching for pending Amazon orders...\n');

    // Find all pending expenses with Amazon SPAID
    const query = userId
      ? `SELECT e.*, u.email, u.first_name, u.last_name, u.role
         FROM expenses e
         JOIN users u ON e.user_id = u.id
         WHERE e.user_id = $1 AND e.status = 'pending' AND e.amazon_spaid IS NOT NULL
         ORDER BY e.created_at DESC`
      : `SELECT e.*, u.email, u.first_name, u.last_name, u.role
         FROM expenses e
         JOIN users u ON e.user_id = u.id
         WHERE e.status = 'pending' AND e.amazon_spaid IS NOT NULL
         ORDER BY e.created_at DESC`;

    const params = userId ? [userId] : [];
    const result = await db.query(query, params);

    if (result.rows.length === 0) {
      console.log('✓ No pending Amazon orders found.');
      return;
    }

    console.log(`Found ${result.rows.length} pending Amazon order(s):\n`);

    for (const expense of result.rows) {
      console.log(`📦 Expense ID: ${expense.id}`);
      console.log(`   User: ${expense.first_name} ${expense.last_name} (${expense.email}) - Role: ${expense.role}`);
      console.log(`   Description: ${expense.description}`);
      console.log(`   Amount: $${expense.amount}`);
      console.log(`   Amazon SPAID: ${expense.amazon_spaid}`);
      console.log(`   Status: ${expense.status}`);
      console.log(`   Created: ${expense.created_at}`);
      console.log('');
    }

    console.log('🔄 Approving orders and sending to Amazon...\n');

    for (const expense of result.rows) {
      try {
        // Update expense to approved status
        await db.query(
          `UPDATE expenses
           SET status = 'approved',
               approved_at = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [expense.id]
        );

        console.log(`✓ Expense ${expense.id} approved`);

        // If it has Amazon SPAID and order is pending, send to Amazon
        if (expense.amazon_spaid && (!expense.amazon_order_status || expense.amazon_order_status === 'pending')) {
          console.log(`🛒 Sending order to Amazon for expense ${expense.id}...`);

          // Get location if expense has one
          let location = null;
          if (expense.location_id) {
            const locResult = await db.query('SELECT * FROM locations WHERE id = $1', [expense.location_id]);
            location = locResult.rows[0];
          }

          const orderResult = await sendOrderToAmazon(expense, {
            email: expense.email,
            name: `${expense.first_name} ${expense.last_name}`,
            location: location
          });

          if (orderResult.success) {
            console.log(`✓ Amazon order placed successfully! PO Number: ${orderResult.poNumber}`);

            // Update expense with Amazon PO confirmation
            await db.query(
              `UPDATE expenses
               SET amazon_po_number = $1,
                   amazon_order_status = 'confirmed',
                   amazon_order_sent_at = CURRENT_TIMESTAMP,
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = $2`,
              [orderResult.poNumber, expense.id]
            );

            console.log(`✓ Expense ${expense.id} updated with PO number: ${orderResult.poNumber}\n`);
          } else {
            console.error(`✗ Failed to place Amazon order for expense ${expense.id}:`, orderResult.error);

            // Mark order as failed
            await db.query(
              `UPDATE expenses
               SET amazon_order_status = 'failed',
                   amazon_order_sent_at = CURRENT_TIMESTAMP,
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = $1`,
              [expense.id]
            );
            console.log(`✗ Expense ${expense.id} marked as failed\n`);
          }
        } else {
          console.log(`  (No Amazon order to place for expense ${expense.id})\n`);
        }
      } catch (error) {
        console.error(`✗ Error processing expense ${expense.id}:`, error.message);
        console.log('');
      }
    }

    console.log('✅ Done!');
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    process.exit(0);
  }
}

// Get user ID from command line args if provided
const userId = process.argv[2] ? parseInt(process.argv[2]) : null;

approvePendingAmazonOrders(userId);

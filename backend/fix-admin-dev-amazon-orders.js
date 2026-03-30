/**
 * Script to fix stuck Amazon orders from admin/developer users
 * This auto-approves pending orders from privileged users and sends them to Amazon
 *
 * Usage: node fix-admin-dev-amazon-orders.js
 */

const db = require('./config/database');
const { sendOrderToAmazon } = require('./routes/amazonPunchout');

async function fixAdminDevAmazonOrders() {
  try {
    console.log('🔍 Searching for pending Amazon orders from admin/developer users...\n');

    // Find all pending expenses with Amazon SPAID from admin/developer users
    const query = `
      SELECT e.*, u.email, u.first_name, u.last_name, u.role
      FROM expenses e
      JOIN users u ON e.user_id = u.id
      WHERE e.status = 'pending'
        AND e.amazon_spaid IS NOT NULL
        AND u.role IN ('admin', 'developer')
      ORDER BY e.created_at DESC
    `;

    const result = await db.query(query);

    if (result.rows.length === 0) {
      console.log('✓ No pending Amazon orders from admin/developer users found.');
      console.log('  All privileged user orders are either already approved or processed.\n');
      return;
    }

    console.log(`Found ${result.rows.length} pending Amazon order(s) from privileged users:\n`);

    for (const expense of result.rows) {
      console.log(`📦 Expense ID: ${expense.id}`);
      console.log(`   User: ${expense.first_name} ${expense.last_name} (${expense.email})`);
      console.log(`   Role: ${expense.role} ⭐`);
      console.log(`   Description: ${expense.description}`);
      console.log(`   Amount: $${expense.amount}`);
      console.log(`   Amazon SPAID: ${expense.amazon_spaid}`);
      console.log(`   Status: ${expense.status}`);
      console.log(`   Created: ${expense.created_at}`);
      console.log('');
    }

    console.log('🔄 Auto-approving privileged user orders and sending to Amazon...\n');

    let successCount = 0;
    let failCount = 0;

    for (const expense of result.rows) {
      try {
        console.log(`Processing expense ${expense.id}...`);

        // Update expense to approved status
        await db.query(
          `UPDATE expenses
           SET status = 'approved',
               approved_at = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP,
               approval_chain = NULL,
               approval_rule_id = NULL
           WHERE id = $1`,
          [expense.id]
        );

        console.log(`  ✓ Expense ${expense.id} auto-approved (${expense.role} user)`);

        // Send to Amazon if order is pending
        if (expense.amazon_order_status === 'pending' || !expense.amazon_order_status) {
          console.log(`  🛒 Sending order to Amazon...`);

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
            console.log(`  ✓ Amazon order placed! PO Number: ${orderResult.poNumber}`);

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

            console.log(`  ✓ Expense ${expense.id} updated with PO: ${orderResult.poNumber}\n`);
            successCount++;
          } else {
            console.error(`  ✗ Failed to place Amazon order:`, orderResult.error);

            // Mark order as failed
            await db.query(
              `UPDATE expenses
               SET amazon_order_status = 'failed',
                   amazon_order_sent_at = CURRENT_TIMESTAMP,
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = $1`,
              [expense.id]
            );
            console.log(`  ✗ Expense ${expense.id} marked as failed\n`);
            failCount++;
          }
        } else {
          console.log(`  ℹ Amazon order already processed (status: ${expense.amazon_order_status})\n`);
          successCount++;
        }
      } catch (error) {
        console.error(`✗ Error processing expense ${expense.id}:`, error.message);
        console.log('');
        failCount++;
      }
    }

    console.log('─'.repeat(50));
    console.log(`\n✅ Processing complete!`);
    console.log(`   Success: ${successCount}`);
    console.log(`   Failed: ${failCount}`);
    console.log(`   Total: ${result.rows.length}\n`);

    if (successCount > 0) {
      console.log('💡 All privileged user orders have been auto-approved and sent to Amazon.');
    }
    if (failCount > 0) {
      console.log('⚠️  Some orders failed to process. Check the logs above for details.');
    }
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    process.exit(0);
  }
}

console.log('🚀 Admin/Developer Amazon Order Fix Script\n');
console.log('This script will:');
console.log('  1. Find pending Amazon orders from admin/developer users');
console.log('  2. Auto-approve them (privileged users bypass approval)');
console.log('  3. Send them to Amazon for processing\n');
console.log('─'.repeat(50) + '\n');

fixAdminDevAmazonOrders();

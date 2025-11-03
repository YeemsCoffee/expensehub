# Testing the Approvals Fix

## Quick Verification Steps

### 1. Check if migration ran successfully
Run this SQL query to verify tables exist:
```sql
SELECT table_name
FROM information_schema.tables
WHERE table_name IN ('approval_flows', 'expense_approvals', 'approval_steps');
```
You should see all 3 tables.

### 2. Check if approval flows exist
```sql
SELECT id, name, min_amount, max_amount, is_active, approvers
FROM approval_flows
WHERE is_active = true;
```
If empty, you need to create approval flows first.

### 3. Test the API endpoint directly
```bash
# Get your auth token first by logging in
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"your-email@example.com","password":"your-password"}'

# Then test the pending approvals endpoint
curl -X GET http://localhost:5000/api/expense-approvals/pending-for-me \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

Expected responses:
- ✅ `[]` (empty array) - No pending approvals, everything working!
- ✅ `[{...expense data...}]` - Approvals found, everything working!
- ❌ `{"error": "..."}` - Still an issue

### 4. Browser Console Check
Open browser DevTools (F12) → Network tab → Refresh the Approvals page:
- Look for the request to `/api/expense-approvals/pending-for-me`
- Status should be 200 OK (not 404 Not Found)
- Response should be JSON array

### 5. Server Logs
Check your backend server console for:
```
GET /api/expense-approvals/pending-for-me
```
Should NOT show "404" - should show "200"

## Creating Your First Approval Flow (if needed)

If you don't have any approval flows yet:

1. **Login as admin**
2. **Go to Approval Flows page**
3. **Create a flow**, for example:
   - Name: "Manager Approval"
   - Min Amount: $0
   - Max Amount: $5000
   - Approvers: [Select a manager/admin user]

4. **Submit a test expense** (as regular employee)
5. **Check Approvals page** (as the selected approver)

## Common Issues

### Issue: Still getting "couldn't load approvals"
- **Cause**: Server not restarted after code changes
- **Fix**: Restart the backend server

### Issue: 403 Forbidden
- **Cause**: User doesn't have manager/admin role
- **Fix**: Update user role in database:
```sql
UPDATE users SET role = 'manager' WHERE email = 'your-email@example.com';
```

### Issue: Empty array but you expect approvals
- **Cause**:
  1. No expenses are in approval workflow, OR
  2. No approval flows are set up, OR
  3. You're not assigned as an approver
- **Fix**: Check approval flows and expense status in database

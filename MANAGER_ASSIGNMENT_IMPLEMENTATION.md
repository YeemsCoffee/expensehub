# Manager Assignment Implementation Guide

## Overview
Enable employees to submit expenses to a default manager with ability to select alternate managers.

## Database Changes

### Run Migration
```bash
psql -U postgres -d expensehub -f backend/database/manager_assignment_migration.sql
```

This adds:
- `users.manager_id` - Employee's default manager
- `expenses.assigned_approver_id` - Manager assigned to approve the expense

---

## Backend Changes Needed

### 1. Update `routes/users.js`

Add endpoint to update user's manager:

```javascript
// Update user's manager
router.put('/:id/manager', authMiddleware, isAdminOrDeveloper, [
  body('managerId').optional({ nullable: true }).isInt()
], async (req, res) => {
  try {
    const { managerId } = req.body;

    // Validate manager exists and has manager role
    if (managerId) {
      const managerCheck = await db.query(
        'SELECT role FROM users WHERE id = $1',
        [managerId]
      );

      if (managerCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Manager not found' });
      }

      if (managerCheck.rows[0].role !== 'manager') {
        return res.status(400).json({ error: 'Selected user must have manager role' });
      }
    }

    await db.query(
      'UPDATE users SET manager_id = $1 WHERE id = $2',
      [managerId, req.params.id]
    );

    res.json({ message: 'Manager updated successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Server error updating manager' });
  }
});
```

### 2. Update `routes/users.js` - GET endpoint

Update the GET endpoint to include manager info:

```javascript
router.get('/', authMiddleware, isAdminOrDeveloper, async (req, res) => {
  const result = await db.query(
    `SELECT u.id, u.email, u.first_name, u.last_name, u.employee_id,
            u.department, u.role, u.is_active, u.created_at, u.manager_id,
            m.first_name || ' ' || m.last_name as manager_name
     FROM users u
     LEFT JOIN users m ON u.manager_id = m.id
     ORDER BY u.created_at DESC`
  );
  res.json(result.rows);
});
```

### 3. Update `routes/expenses.js` - POST endpoint

Update expense creation to include assigned_approver_id:

```javascript
router.post('/', authMiddleware, [...], async (req, res) => {
  const {
    // ... existing fields
    assignedApproverId  // NEW FIELD
  } = req.body;

  // If no approver specified, use user's default manager
  let approverId = assignedApproverId;
  if (!approverId) {
    const userResult = await db.query(
      'SELECT manager_id FROM users WHERE id = $1',
      [req.user.id]
    );
    approverId = userResult.rows[0]?.manager_id;
  }

  const result = await db.query(
    `INSERT INTO expenses (..., assigned_approver_id, ...)
     VALUES (..., $X, ...)`,
    [..., approverId, ...]
  );

  res.json({ message: 'Expense submitted successfully' });
});
```

### 4. Update `routes/expenseApprovals.js` or create new logic

Update the pending approvals endpoint to use assigned_approver_id:

```javascript
router.get('/pending-for-me', authMiddleware, isManagerOrAdmin, async (req, res) => {
  const query = `
    SELECT e.*,
           u.first_name || ' ' || u.last_name as submitted_by
    FROM expenses e
    JOIN users u ON e.user_id = u.id
    WHERE e.assigned_approver_id = $1
      AND e.status = 'pending'
    ORDER BY e.created_at ASC
  `;

  const result = await db.query(query, [req.user.id]);
  res.json(result.rows);
});
```

---

## Frontend Changes Needed

### 1. Update `pages/Users.js`

**Add Manager Column to Table:**
```javascript
<th>Manager</th>
// ...
<td>{user.manager_name || '-'}</td>
```

**Add Manager Field to Edit Modal:**
```javascript
<div className="form-group">
  <label className="form-label">Manager</label>
  <select
    value={editFormData.managerId || ''}
    onChange={(e) => setEditFormData({ ...editFormData, managerId: e.target.value })}
    className="form-select"
  >
    <option value="">No Manager</option>
    {users
      .filter(u => u.role === 'manager')
      .map(manager => (
        <option key={manager.id} value={manager.id}>
          {manager.first_name} {manager.last_name}
        </option>
      ))}
  </select>
</div>
```

**Add Manager Field to Create Modal:**
Same as above in the create form.

**Update handleUpdateRole to also update manager:**
```javascript
const handleUpdateUser = async (e) => {
  e.preventDefault();

  await api.put(`/users/${editingUser.id}/role`, { role: editFormData.role });

  if (editFormData.managerId !== editingUser.manager_id) {
    await api.put(`/users/${editingUser.id}/manager`, {
      managerId: editFormData.managerId || null
    });
  }

  toast.success('User updated successfully!');
  fetchUsers();
  handleCancelEdit();
};
```

### 2. Update `pages/ExpenseSubmit.js`

**Add State for Managers:**
```javascript
const [managers, setManagers] = useState([]);
const [selectedApprover, setSelectedApprover] = useState(null);
```

**Fetch Managers on Load:**
```javascript
useEffect(() => {
  const fetchManagers = async () => {
    try {
      const response = await api.get('/users');
      const managerList = response.data.filter(u => u.role === 'manager');
      setManagers(managerList);

      // Set default to user's manager if they have one
      const currentUser = JSON.parse(localStorage.getItem('user'));
      const userDetails = response.data.find(u => u.id === currentUser.id);
      if (userDetails?.manager_id) {
        setSelectedApprover(userDetails.manager_id);
      }
    } catch (err) {
      console.error('Error fetching managers:', err);
    }
  };
  fetchManagers();
}, []);
```

**Add Approver Field to Form:**
```javascript
<div className="form-group">
  <label className="form-label">Approver (Manager) *</label>
  <select
    value={selectedApprover || ''}
    onChange={(e) => setSelectedApprover(e.target.value)}
    className="form-select"
    required
  >
    <option value="">Select a manager</option>
    {managers.map(manager => (
      <option key={manager.id} value={manager.id}>
        {manager.first_name} {manager.last_name}
      </option>
    ))}
  </select>
  <p className="form-hint">
    Select your manager or an alternate manager if yours is unavailable
  </p>
</div>
```

**Include in Submit:**
```javascript
const handleSubmit = async (e) => {
  e.preventDefault();

  const expenseData = {
    // ... existing fields
    assignedApproverId: selectedApprover
  };

  await api.post('/expenses', expenseData);
  toast.success('Expense submitted successfully!');
};
```

### 3. Update `pages/Approvals.js`

The existing endpoint `/expense-approvals/pending-for-me` needs to be updated in the backend to use `assigned_approver_id` instead of the approval flow logic.

---

## Testing Steps

1. **Run Migration**
   ```bash
   psql -U postgres -d expensehub -f backend/database/manager_assignment_migration.sql
   ```

2. **Set Up Test Data**
   - Create a manager user (role='manager')
   - Create an employee user (role='employee')
   - In Users page, assign the manager to the employee

3. **Test Submission**
   - Log in as employee
   - Submit expense
   - Approver field should default to their manager
   - Try selecting a different manager
   - Submit expense

4. **Test Approval**
   - Log in as the manager
   - Go to Approvals page
   - Should see the expense submitted by the employee
   - Approve or reject it

---

## Summary

**Employee Flow:**
1. Employee submits expense
2. Approver field defaults to their assigned manager
3. Employee can select any manager if theirs is unavailable
4. Expense goes to selected manager

**Manager Flow:**
1. Manager sees expenses assigned to them in Approvals page
2. Manager can approve/reject

**No approval flows needed** - Direct assignment from employee to manager!


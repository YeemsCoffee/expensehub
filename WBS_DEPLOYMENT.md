# WBS Elements Deployment Guide

## 🎯 Overview

The WBS (Work Breakdown Structure) feature allows projects to have detailed budget breakdowns by category, similar to SAP WBS elements.

## 📋 Prerequisites

Before deploying the WBS feature to production (Render), you need to run the database migration.

## 🚀 Deployment Steps

### 1. Run Database Migration

**Option A: Using the migration runner script**

```bash
cd backend
node scripts/run-migrations.js add_wbs_elements.sql
```

**Option B: Manual SQL execution**

Connect to your PostgreSQL database and run:

```bash
psql $DATABASE_URL -f backend/database/add_wbs_elements.sql
```

**Option C: On Render**

1. Go to your Render dashboard
2. Open your PostgreSQL instance
3. Click "Connect" → "External Connection"
4. Use the provided connection string to connect via psql
5. Run the migration file contents

### 2. Verify Migration

Check if the table was created:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_name = 'project_wbs_elements';
```

### 3. Deploy Backend Code

The backend changes include:
- ✅ Fixed WBS fetch endpoint SQL query
- ✅ Added duplicate WBS prevention
- ✅ Enhanced error logging

### 4. Deploy Frontend Code

The frontend changes include:
- ✅ Category auto-fill from WBS elements
- ✅ Disabled category field when WBS selected
- ✅ Better UX for expense submission

## 🗄️ Database Schema

The migration creates:

**Table: `project_wbs_elements`**
- `id` - Serial primary key
- `project_id` - Reference to projects table
- `code` - Unique WBS code (format: PROJECT_CODE-01, PROJECT_CODE-02, etc.)
- `category` - Budget category name
- `description` - Optional description
- `budget_estimate` - Budget allocation for this category
- `is_active` - Soft delete flag
- `created_at` - Timestamp
- `updated_at` - Timestamp

**Column added to `expenses` table:**
- `wbs_element_id` - Optional reference to WBS element

## 🧪 Testing

After deployment, test:

1. ✅ Create a new project with WBS elements
2. ✅ Fetch WBS elements for a project (no 500 errors)
3. ✅ Submit an expense with WBS element selected
4. ✅ Verify category is auto-filled from WBS

## 🐛 Troubleshooting

### Error: "relation 'project_wbs_elements' does not exist"

**Cause:** Migration hasn't been run on the database

**Solution:** Run the migration (see step 1 above)

### Error: "WBS elements already exist for this project"

**Cause:** Trying to create WBS elements twice for the same project

**Solution:** This is expected behavior to prevent duplicates

### 500 Error on WBS fetch

**Cause:** SQL GROUP BY issue (already fixed in latest code)

**Solution:** Deploy the latest backend code

## 📝 Migration File Location

`backend/database/add_wbs_elements.sql`

## 🔗 Related Files

**Backend:**
- `backend/routes/projects.js` - WBS CRUD endpoints
- `backend/routes/expenses.js` - Expense submission with WBS

**Frontend:**
- `frontend/src/pages/Projects.js` - Project creation with WBS
- `frontend/src/pages/ProjectDetails.js` - WBS display
- `frontend/src/pages/ExpenseSubmit.js` - WBS selection in expenses

## ✅ Post-Deployment Checklist

- [ ] Database migration completed
- [ ] Backend code deployed
- [ ] Frontend code deployed
- [ ] Test project creation with WBS
- [ ] Test expense submission with WBS
- [ ] Verify no 500 errors
- [ ] Check error logs for any issues

## 🎉 Expected Behavior

**Creating a Project:**
1. User fills project form
2. User adds WBS elements (optional)
3. Each WBS gets unique code: `PROJECT_CODE-01`, `PROJECT_CODE-02`, etc.
4. Total WBS budget must equal project budget (if both specified)

**Submitting an Expense:**
1. User selects approved project
2. WBS elements load automatically
3. User selects WBS element
4. **Category field becomes optional and disabled**
5. Category is auto-filled from WBS element
6. Expense tracks spending against specific WBS budget

## 📊 Benefits

- ✅ Detailed project budget tracking
- ✅ SAP-like WBS structure
- ✅ Automatic category inheritance
- ✅ Cleaner expense submission UX
- ✅ Better budget control and reporting

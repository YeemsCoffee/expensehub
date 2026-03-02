# Phase 2: SAP-Like Project Management Enhancements

## 🎯 Overview

Phase 2 transforms ExpenseHub into an enterprise-grade project management system with SAP-level capabilities, including:

- ✅ **Work Breakdown Structure (WBS)** - Already implemented
- ✅ **Project Phases & Milestones** - Stage-gate process
- ✅ **Change Request Management** - Formal change control
- ✅ **Project Templates** - Reusable blueprints
- ✅ **Document Management** - Version control & approvals
- ✅ **Comprehensive Audit Trail** - Full traceability of all actions

---

## 📊 Features Breakdown

### 1. Work Breakdown Structure (WBS) ✅

**Already Implemented** - See `WBS_DEPLOYMENT.md`

#### Capabilities:
- Hierarchical budget breakdown by category
- WBS elements linked to projects
- Automatic expense category inheritance
- Budget tracking per WBS element

#### Database:
- Table: `project_wbs_elements`
- Links: `expenses.wbs_element_id → project_wbs_elements.id`

---

### 2. Project Phases & Milestones 🆕

**Stage-Gate Process Management**

#### Features:
- **Multi-phase project organization** (Initiation → Planning → Execution → Monitoring → Closure)
- **Gate approvals** - Go/No-Go decision points between phases
- **Phase-based budgeting** - Allocate budgets to specific phases
- **Milestones tracking** - Planned vs. actual dates
- **Critical path identification** - Flag critical milestones
- **Phase status tracking** - not_started, in_progress, completed, on_hold

#### API Endpoints:

##### Phases
```
GET    /api/project-phases/:projectId          Get all phases for a project
POST   /api/project-phases                     Create new phase
PUT    /api/project-phases/:id                 Update phase
POST   /api/project-phases/:id/approve-gate    Approve phase gate (Go/No-Go)
```

##### Milestones
```
GET    /api/project-phases/milestones/:projectId   Get all milestones for project
POST   /api/project-phases/milestones              Create milestone
PUT    /api/project-phases/milestones/:id          Update milestone
DELETE /api/project-phases/milestones/:id          Delete milestone
```

#### Example Usage:

**Create a Phase:**
```javascript
POST /api/project-phases
{
  "project_id": 1,
  "name": "Planning",
  "description": "Project planning and requirements gathering",
  "sequence_order": 1,
  "planned_start_date": "2026-03-01",
  "planned_end_date": "2026-03-31",
  "budget_allocation": 50000.00,
  "gate_approval_required": true
}
```

**Approve Phase Gate:**
```javascript
POST /api/project-phases/5/approve-gate
{
  "decision": "approved", // approved, rejected, conditional
  "notes": "All deliverables met. Approved to proceed to execution phase."
}
```

**Create a Milestone:**
```javascript
POST /api/project-phases/milestones
{
  "project_id": 1,
  "phase_id": 5,
  "name": "Requirements Sign-Off",
  "description": "Stakeholder approval of requirements document",
  "milestone_type": "approval",
  "planned_date": "2026-03-15",
  "is_critical_path": true
}
```

---

### 3. Change Request Management 🆕

**Formal Change Control Process**

#### Features:
- **Structured change requests** - Scope, schedule, budget, resource changes
- **Impact analysis** - Assess effects on scope, schedule, budget, quality, risk
- **Multi-level approval workflow** - Different approvers for different levels
- **Cost-benefit analysis** - Justify change with financial impact
- **Implementation tracking** - Track when changes are actually applied
- **Change history** - Full audit trail of all changes

#### API Endpoints:

```
GET    /api/change-requests/project/:projectId    Get all CRs for project
GET    /api/change-requests/:id                   Get specific CR with approvals
POST   /api/change-requests                       Submit new change request
PUT    /api/change-requests/:id                   Update CR (before approval)
POST   /api/change-requests/:id/review            Review CR (approve/reject)
POST   /api/change-requests/:id/approve           Approve at specific level
POST   /api/change-requests/:id/implement         Mark as implemented
```

#### Change Request Lifecycle:

```
submitted → under_review → approved/rejected → implemented
```

#### Multi-Level Approval:

```javascript
// Define approval levels when creating CR
{
  "approvers": [
    { "approver_id": 5, "approval_level": 1 }, // Manager
    { "approver_id": 12, "approval_level": 2 }, // Finance
    { "approver_id": 3, "approval_level": 3 }  // Executive
  ]
}

// Each approver approves at their level
POST /api/change-requests/10/approve
{
  "approval_level": 1,
  "comments": "Budget impact is acceptable"
}
```

#### Example Usage:

**Submit Change Request:**
```javascript
POST /api/change-requests
{
  "project_id": 1,
  "title": "Add Mobile App Development",
  "description": "Customer requested native mobile apps for iOS and Android",
  "change_type": "scope",
  "change_category": "enhancement",
  "impact_scope": "Adds 2 new deliverables: iOS app and Android app",
  "impact_schedule": "Extends timeline by 8 weeks",
  "impact_budget": 75000.00,
  "impact_resources": "Requires 2 additional mobile developers",
  "impact_quality": "No negative impact, enhances customer experience",
  "impact_risk": "Low risk - team has mobile development experience",
  "estimated_cost": 75000.00,
  "cost_benefit_analysis": "Expected to increase user adoption by 40%",
  "priority": "high",
  "approvers": [
    { "approver_id": 5, "approval_level": 1 },
    { "approver_id": 12, "approval_level": 2 }
  ]
}
```

**Implement Approved Change:**
```javascript
POST /api/change-requests/10/implement
{
  "implementation_notes": "Budget increased, new resources onboarded, timeline adjusted"
}
// Automatically updates project budget based on impact_budget
```

---

### 4. Project Templates 🆕

**Reusable Project Blueprints**

#### Features:
- **Template library** - Industry-specific templates (IT, Marketing, R&D, Construction)
- **Pre-defined WBS** - Standard budget categories
- **Standard phases** - Typical project phases with durations
- **Default milestones** - Key deliverables and decision points
- **One-click instantiation** - Create projects from templates
- **Public/Private templates** - Share templates across organization

#### API Endpoints:

```
GET    /api/project-templates                 Get all templates (public + own)
GET    /api/project-templates/:id             Get template with all components
POST   /api/project-templates                 Create new template
POST   /api/project-templates/:id/instantiate Create project from template
DELETE /api/project-templates/:id             Delete template
```

#### Example Usage:

**Create Template:**
```javascript
POST /api/project-templates
{
  "name": "Website Redesign",
  "description": "Standard template for website redesign projects",
  "template_code": "WEB-REDESIGN-V1",
  "industry": "IT",
  "project_type": "Website",
  "estimated_duration_days": 90,
  "estimated_budget": 100000.00,
  "is_public": true,
  "phases": [
    {
      "name": "Discovery",
      "description": "User research and competitive analysis",
      "sequence_order": 1,
      "duration_days": 15,
      "budget_percentage": 15.00,
      "gate_approval_required": true
    },
    {
      "name": "Design",
      "sequence_order": 2,
      "duration_days": 30,
      "budget_percentage": 25.00
    },
    {
      "name": "Development",
      "sequence_order": 3,
      "duration_days": 35,
      "budget_percentage": 45.00
    },
    {
      "name": "Launch",
      "sequence_order": 4,
      "duration_days": 10,
      "budget_percentage": 15.00
    }
  ],
  "wbs_elements": [
    { "category": "User Research", "budget_percentage": 10.00, "phase_name": "Discovery" },
    { "category": "UI/UX Design", "budget_percentage": 20.00, "phase_name": "Design" },
    { "category": "Frontend Development", "budget_percentage": 25.00, "phase_name": "Development" },
    { "category": "Backend Development", "budget_percentage": 20.00, "phase_name": "Development" },
    { "category": "Testing & QA", "budget_percentage": 15.00, "phase_name": "Development" },
    { "category": "Deployment", "budget_percentage": 10.00, "phase_name": "Launch" }
  ],
  "milestones": [
    {
      "name": "Research Complete",
      "milestone_type": "deliverable",
      "days_from_start": 15,
      "phase_name": "Discovery"
    },
    {
      "name": "Design Approval",
      "milestone_type": "approval",
      "days_from_start": 45,
      "is_critical_path": true,
      "phase_name": "Design"
    },
    {
      "name": "Go Live",
      "milestone_type": "deliverable",
      "days_from_start": 90,
      "is_critical_path": true,
      "phase_name": "Launch"
    }
  ]
}
```

**Instantiate Project from Template:**
```javascript
POST /api/project-templates/3/instantiate
{
  "code": "WEB-2026-001",
  "name": "Corporate Website Redesign",
  "description": "Modernize company website with new branding",
  "start_date": "2026-04-01",
  "budget": 120000.00,
  "project_manager": "Jane Smith"
}

// Creates:
// - Project with all template settings
// - 4 phases with calculated dates
// - 6 WBS elements with budget allocations
// - 3 milestones with planned dates
```

---

### 5. Document Management 🆕

**Version-Controlled Document Repository**

#### Features:
- **File uploads** - PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, images
- **Version control** - Track document versions with parent/child relationships
- **Document categorization** - Planning, Execution, Closure, Legal, Financial, Technical
- **Approval workflow** - Documents can require approval before being final
- **Link to phases/CRs** - Attach documents to specific phases or change requests
- **Tag-based search** - Find documents by tags
- **Confidential marking** - Flag sensitive documents
- **Download tracking** - Audit who downloaded what

#### API Endpoints:

```
GET    /api/project-documents/project/:projectId    Get all docs for project
GET    /api/project-documents/:id                   Get specific document
GET    /api/project-documents/:id/versions          Get all versions
POST   /api/project-documents/upload                Upload new document
GET    /api/project-documents/:id/download          Download file
PUT    /api/project-documents/:id                   Update metadata
POST   /api/project-documents/:id/approve           Approve document
DELETE /api/project-documents/:id                   Delete document
```

#### Example Usage:

**Upload Document:**
```javascript
POST /api/project-documents/upload
Content-Type: multipart/form-data

{
  "file": [file binary],
  "project_id": 1,
  "phase_id": 5,
  "document_name": "Requirements Specification",
  "document_type": "technical_doc",
  "document_category": "Planning",
  "version": "1.0",
  "description": "Detailed requirements for website redesign",
  "tags": "requirements,specifications,planning",
  "is_confidential": false,
  "requires_approval": true
}
```

**Upload New Version:**
```javascript
POST /api/project-documents/upload
{
  "file": [file binary],
  "parent_document_id": 42, // Links to previous version
  "version": "2.0",
  "version_notes": "Updated based on stakeholder feedback"
  // ... other fields
}
// Automatically marks v1.0 as not latest version
```

**Approve Document:**
```javascript
POST /api/project-documents/42/approve
// Sets approval_status to 'approved' and records approver
```

---

### 6. Comprehensive Audit Trail 🆕

**Full Traceability of All Actions**

#### Features:
- **Automatic logging** - Every action is logged via middleware
- **Who, What, When** - User, action type, timestamp
- **Before/After snapshots** - JSON snapshots of record state
- **Changed fields tracking** - Know exactly what changed
- **IP address & user agent** - Security tracking
- **Business context** - Link to projects, expenses, CRs
- **Success/Failure tracking** - Know if actions succeeded
- **Project-specific trail** - Fast access to project history
- **Comparison tools** - Compare states between timestamps
- **Audit statistics** - Activity reports for compliance

#### API Endpoints:

```
GET /api/audit-trail                           Get audit log with filters
GET /api/audit-trail/project/:projectId        Get project-specific trail
GET /api/audit-trail/record/:table/:recordId   Get trail for specific record
GET /api/audit-trail/user/:userId              Get all actions by user
GET /api/audit-trail/compare/:table/:recordId  Compare changes over time
GET /api/audit-trail/stats/summary             Get audit statistics
```

#### Query Parameters:

```javascript
GET /api/audit-trail?user_id=5&action_type=UPDATE_PROJECT&start_date=2026-03-01&end_date=2026-03-31&limit=50&offset=0
```

#### Example Queries:

**View All Actions on a Project:**
```javascript
GET /api/audit-trail/project/15

Response:
{
  "entries": [
    {
      "id": 1234,
      "user_id": 5,
      "action_type": "UPDATE_PROJECT",
      "field_name": "budget",
      "old_value": "100000.00",
      "new_value": "125000.00",
      "description": "Changed budget from \"100000.00\" to \"125000.00\"",
      "timestamp": "2026-03-02T14:30:00Z",
      "ip_address": "192.168.1.100"
    }
  ],
  "total": 156,
  "limit": 100,
  "offset": 0
}
```

**Compare Changes Over Time:**
```javascript
GET /api/audit-trail/compare/projects/15?from_timestamp=2026-03-01T00:00:00Z&to_timestamp=2026-03-02T23:59:59Z

Response:
{
  "changes": [
    {
      "field": "budget",
      "initial_value": "100000.00",
      "final_value": "125000.00",
      "change_count": 2,
      "changed_by": ["John Doe", "Jane Smith"]
    },
    {
      "field": "status",
      "initial_value": "pending",
      "final_value": "approved",
      "change_count": 1,
      "changed_by": ["Jane Smith"]
    }
  ]
}
```

**Audit Statistics:**
```javascript
GET /api/audit-trail/stats/summary?start_date=2026-03-01&end_date=2026-03-31

Response:
{
  "total_actions": 1247,
  "action_types": [
    { "action_type": "VIEW_PROJECT", "count": 456 },
    { "action_type": "UPDATE_EXPENSE", "count": 234 },
    { "action_type": "APPROVE_PROJECT", "count": 89 }
  ],
  "top_users": [
    { "username": "John Doe", "action_count": 345 },
    { "username": "Jane Smith", "action_count": 298 }
  ],
  "status_distribution": [
    { "action_status": "success", "count": 1230 },
    { "action_status": "failure", "count": 17 }
  ]
}
```

#### Middleware Usage:

```javascript
// Automatically logs actions
router.post('/projects', auth, auditLog('CREATE_PROJECT'), async (req, res) => {
  // ... route logic
  req.auditData = { project: newProject }; // Attach data for audit
});

// Every action is logged with:
// - User who performed it
// - What they did
// - Old vs new values
// - IP address, timestamp, etc.
```

---

## 🗄️ Database Schema

### New Tables:

1. **`project_phases`** - Project phases for stage-gate process
2. **`project_milestones`** - Key milestones and deliverables
3. **`project_change_requests`** - Change request management
4. **`change_request_approvals`** - Multi-level approval workflow
5. **`project_templates`** - Reusable project blueprints
6. **`template_phases`** - Default phases for templates
7. **`template_wbs_elements`** - Default WBS for templates
8. **`template_milestones`** - Default milestones for templates
9. **`project_documents`** - Document management with version control
10. **`audit_log`** - Comprehensive audit trail
11. **`project_audit_trail`** - Project-specific audit trail (denormalized)

### Schema Enhancements:

```sql
-- Link WBS to phases
ALTER TABLE project_wbs_elements ADD COLUMN phase_id INTEGER REFERENCES project_phases(id);

-- Track template usage
ALTER TABLE projects ADD COLUMN template_id INTEGER REFERENCES project_templates(id);
ALTER TABLE projects ADD COLUMN created_from_template BOOLEAN DEFAULT false;
```

---

## 🚀 Deployment

### 1. Run Database Migration

```bash
cd backend
psql $DATABASE_URL -f database/phase2_sap_enhancements.sql
```

### 2. Verify Tables Created

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'project_phases',
    'project_milestones',
    'project_change_requests',
    'change_request_approvals',
    'project_templates',
    'template_phases',
    'template_wbs_elements',
    'template_milestones',
    'project_documents',
    'audit_log',
    'project_audit_trail'
  )
ORDER BY table_name;
```

### 3. Test Endpoints

```bash
# Health check
curl http://localhost:5000/api/health

# Create a phase
curl -X POST http://localhost:5000/api/project-phases \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": 1,
    "name": "Planning",
    "sequence_order": 1,
    "planned_start_date": "2026-03-01",
    "planned_end_date": "2026-03-31",
    "budget_allocation": 50000.00
  }'
```

---

## 📊 Data Flow

### Project Creation from Template:

```
1. User selects template
   ↓
2. POST /api/project-templates/:id/instantiate
   ↓
3. Creates project record
   ↓
4. Creates phases (with calculated dates based on template)
   ↓
5. Creates WBS elements (with budget % applied to actual budget)
   ↓
6. Creates milestones (with dates calculated from start_date)
   ↓
7. All actions logged to audit_log
   ↓
8. Returns complete project structure
```

### Change Request Workflow:

```
1. User submits CR
   ↓
2. POST /api/change-requests (status: submitted)
   ↓
3. Approval workflow created
   ↓
4. Level 1 approver reviews
   ↓
5. POST /api/change-requests/:id/approve (level: 1)
   ↓
6. Level 2 approver reviews
   ↓
7. POST /api/change-requests/:id/approve (level: 2)
   ↓
8. All approvals complete → status: approved
   ↓
9. POST /api/change-requests/:id/implement
   ↓
10. Budget/timeline updated → status: implemented
    ↓
11. Full audit trail maintained
```

---

## 🔒 Security & Permissions

### Role-Based Access:

| Action | Employee | Manager | Admin |
|--------|----------|---------|-------|
| View phases/milestones | ✅ | ✅ | ✅ |
| Create phase/milestone | ❌ | ✅ | ✅ |
| Approve phase gate | ❌ | ✅ | ✅ |
| Submit change request | ✅ | ✅ | ✅ |
| Review change request | ❌ | ✅ | ✅ |
| Create template | ❌ | ✅ | ✅ |
| Upload document | ✅ | ✅ | ✅ |
| Approve document | ❌ | ✅ | ✅ |
| View audit trail | ❌ | ✅ | ✅ |
| View audit stats | ❌ | ✅ | ✅ |

### Audit Logging:

**ALL actions are logged automatically**, including:
- ✅ Who performed the action
- ✅ What was changed (before/after)
- ✅ When it happened
- ✅ IP address & user agent
- ✅ Success or failure
- ✅ Business context (project, expense, etc.)

**Cannot be disabled or bypassed** - ensures compliance and traceability.

---

## 📈 Benefits

### 1. **SAP-Level Capabilities**
- Enterprise-grade project management
- Formal change control
- Stage-gate approval process
- Complete audit compliance

### 2. **Efficiency Gains**
- Reusable templates save time
- Standardized processes reduce errors
- Automated workflows eliminate manual tracking

### 3. **Compliance & Governance**
- Complete audit trail for SOX/GDPR
- Multi-level approvals for financial controls
- Document version control
- Change request accountability

### 4. **Visibility & Control**
- Phase-based tracking
- Milestone monitoring
- Change impact analysis
- Real-time audit reports

---

## 🧪 Testing Checklist

- [ ] Run database migration successfully
- [ ] Create a project phase
- [ ] Approve a phase gate
- [ ] Create and update a milestone
- [ ] Submit a change request
- [ ] Multi-level approval workflow
- [ ] Implement approved change request (verify budget update)
- [ ] Create a project template
- [ ] Instantiate project from template
- [ ] Upload a document
- [ ] Create new document version
- [ ] Approve a document
- [ ] Download a document
- [ ] View audit trail for a project
- [ ] Compare changes over time
- [ ] View audit statistics
- [ ] Verify all actions are logged

---

## 📝 Next Steps (Phase 3)

Future enhancements could include:

- **Resource Management** - Allocate team members to projects
- **Time Tracking** - Billable hours and timesheets
- **Portfolio Management** - Multi-project dashboards
- **Earned Value Management** - Advanced cost/schedule performance
- **Risk Register** - Risk tracking and mitigation
- **Gantt Charts** - Visual timeline
- **Mobile App** - Approvals on the go

---

## 🎉 Summary

Phase 2 transforms ExpenseHub from a simple expense tracking system into a **comprehensive SAP-like project management platform** with:

✅ **Stage-gate project management**
✅ **Formal change control**
✅ **Reusable templates for standardization**
✅ **Document repository with version control**
✅ **Complete audit traceability**

**All actions are automatically logged** - providing unprecedented visibility and compliance for enterprise customers.

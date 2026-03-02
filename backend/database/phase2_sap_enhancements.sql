-- ============================================================================
-- PHASE 2: SAP-LIKE PROJECT MANAGEMENT ENHANCEMENTS
-- ============================================================================
-- Features:
-- 1. Project Phases & Milestones (Stage-Gate Process)
-- 2. Change Request Management
-- 3. Project Templates
-- 4. Document Management
-- 5. Audit Trail (Comprehensive Traceability)
-- ============================================================================

-- ============================================================================
-- 1. PROJECT PHASES & MILESTONES
-- ============================================================================

-- Project Phases (Stage-Gate Process)
CREATE TABLE IF NOT EXISTS project_phases (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL, -- e.g., Initiation, Planning, Execution, Monitoring, Closure
    description TEXT,
    sequence_order INTEGER NOT NULL, -- Order of phases (1, 2, 3, etc.)
    status VARCHAR(50) DEFAULT 'not_started', -- not_started, in_progress, completed, on_hold
    planned_start_date DATE,
    planned_end_date DATE,
    actual_start_date DATE,
    actual_end_date DATE,
    budget_allocation DECIMAL(12, 2),
    gate_approval_required BOOLEAN DEFAULT true, -- Go/No-Go decision point
    gate_approved_by INTEGER REFERENCES users(id),
    gate_approved_at TIMESTAMP,
    gate_decision VARCHAR(50), -- approved, rejected, conditional
    gate_notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_phase_budget CHECK (budget_allocation >= 0),
    CONSTRAINT valid_sequence CHECK (sequence_order > 0)
);

-- Project Milestones
CREATE TABLE IF NOT EXISTS project_milestones (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    phase_id INTEGER REFERENCES project_phases(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    milestone_type VARCHAR(50), -- deliverable, decision_point, approval, payment
    planned_date DATE NOT NULL,
    actual_date DATE,
    status VARCHAR(50) DEFAULT 'pending', -- pending, achieved, missed, cancelled
    is_critical_path BOOLEAN DEFAULT false,
    completion_percentage INTEGER DEFAULT 0,
    achieved_by INTEGER REFERENCES users(id),
    achieved_at TIMESTAMP,
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_completion CHECK (completion_percentage >= 0 AND completion_percentage <= 100)
);

-- Link WBS elements to phases (optional: for phase-based budgeting)
ALTER TABLE project_wbs_elements
ADD COLUMN IF NOT EXISTS phase_id INTEGER REFERENCES project_phases(id) ON DELETE SET NULL;

-- ============================================================================
-- 2. CHANGE REQUEST MANAGEMENT
-- ============================================================================

-- Change Requests
CREATE TABLE IF NOT EXISTS project_change_requests (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    change_number VARCHAR(50) UNIQUE NOT NULL, -- e.g., CR-001, CR-002
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    change_type VARCHAR(50) NOT NULL, -- scope, schedule, budget, resources, quality
    change_category VARCHAR(50), -- enhancement, defect_fix, requirement_change, risk_mitigation
    requested_by INTEGER REFERENCES users(id) NOT NULL,
    requested_date DATE NOT NULL DEFAULT CURRENT_DATE,

    -- Impact Analysis
    impact_scope TEXT, -- How does it affect scope?
    impact_schedule TEXT, -- How does it affect timeline?
    impact_budget DECIMAL(12, 2) DEFAULT 0, -- Budget increase/decrease
    impact_resources TEXT, -- Resource implications
    impact_quality TEXT, -- Quality impact
    impact_risk TEXT, -- Risk assessment

    -- Financials
    estimated_cost DECIMAL(12, 2) DEFAULT 0,
    cost_benefit_analysis TEXT,

    -- Approval Workflow
    status VARCHAR(50) DEFAULT 'submitted', -- submitted, under_review, approved, rejected, implemented, cancelled
    priority VARCHAR(50) DEFAULT 'medium', -- low, medium, high, critical
    reviewed_by INTEGER REFERENCES users(id),
    reviewed_at TIMESTAMP,
    approved_by INTEGER REFERENCES users(id),
    approved_at TIMESTAMP,
    rejection_reason TEXT,

    -- Implementation
    implementation_date DATE,
    implemented_by INTEGER REFERENCES users(id),
    implementation_notes TEXT,

    -- Tracking
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT valid_change_cost CHECK (estimated_cost >= 0)
);

-- Change Request Approvers (Multi-level approval)
CREATE TABLE IF NOT EXISTS change_request_approvals (
    id SERIAL PRIMARY KEY,
    change_request_id INTEGER REFERENCES project_change_requests(id) ON DELETE CASCADE,
    approver_id INTEGER REFERENCES users(id) NOT NULL,
    approval_level INTEGER NOT NULL, -- 1 = Manager, 2 = Finance, 3 = Executive
    approval_status VARCHAR(50) DEFAULT 'pending', -- pending, approved, rejected
    approval_date TIMESTAMP,
    comments TEXT,
    is_required BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_approval_level CHECK (approval_level > 0)
);

-- ============================================================================
-- 3. PROJECT TEMPLATES
-- ============================================================================

-- Project Templates (Reusable blueprints)
CREATE TABLE IF NOT EXISTS project_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    template_code VARCHAR(50) UNIQUE NOT NULL,
    industry VARCHAR(100), -- IT, Construction, Marketing, R&D, etc.
    project_type VARCHAR(100), -- Website, Infrastructure, Campaign, Product Development
    estimated_duration_days INTEGER,
    estimated_budget DECIMAL(12, 2),
    is_public BOOLEAN DEFAULT false, -- Available to all users or just creator
    created_by INTEGER REFERENCES users(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Template Phases (Default phases for template)
CREATE TABLE IF NOT EXISTS template_phases (
    id SERIAL PRIMARY KEY,
    template_id INTEGER REFERENCES project_templates(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    sequence_order INTEGER NOT NULL,
    duration_days INTEGER,
    budget_percentage DECIMAL(5, 2), -- % of total budget (e.g., 20.00 = 20%)
    gate_approval_required BOOLEAN DEFAULT true,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_budget_pct CHECK (budget_percentage >= 0 AND budget_percentage <= 100)
);

-- Template WBS Elements
CREATE TABLE IF NOT EXISTS template_wbs_elements (
    id SERIAL PRIMARY KEY,
    template_id INTEGER REFERENCES project_templates(id) ON DELETE CASCADE,
    phase_id INTEGER REFERENCES template_phases(id) ON DELETE SET NULL,
    category VARCHAR(100) NOT NULL,
    description TEXT,
    budget_percentage DECIMAL(5, 2), -- % of total budget
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_wbs_budget_pct CHECK (budget_percentage >= 0 AND budget_percentage <= 100)
);

-- Template Milestones
CREATE TABLE IF NOT EXISTS template_milestones (
    id SERIAL PRIMARY KEY,
    template_id INTEGER REFERENCES project_templates(id) ON DELETE CASCADE,
    phase_id INTEGER REFERENCES template_phases(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    milestone_type VARCHAR(50),
    days_from_start INTEGER NOT NULL, -- Day offset from project start
    is_critical_path BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_days_offset CHECK (days_from_start >= 0)
);

-- Track which projects were created from templates
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS template_id INTEGER REFERENCES project_templates(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS created_from_template BOOLEAN DEFAULT false;

-- ============================================================================
-- 4. DOCUMENT MANAGEMENT
-- ============================================================================

-- Project Documents
CREATE TABLE IF NOT EXISTS project_documents (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    phase_id INTEGER REFERENCES project_phases(id) ON DELETE SET NULL,
    change_request_id INTEGER REFERENCES project_change_requests(id) ON DELETE SET NULL,

    -- Document Info
    document_name VARCHAR(255) NOT NULL,
    document_type VARCHAR(50), -- contract, sow, change_order, report, invoice, technical_doc, presentation
    document_category VARCHAR(100), -- Planning, Execution, Closure, Legal, Financial, Technical
    version VARCHAR(20) NOT NULL DEFAULT '1.0',
    description TEXT,

    -- File Storage
    file_path VARCHAR(500) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(50), -- pdf, docx, xlsx, etc.
    file_size INTEGER, -- bytes

    -- Metadata
    tags TEXT[], -- Array of tags for searching
    is_confidential BOOLEAN DEFAULT false,
    requires_approval BOOLEAN DEFAULT false,
    approval_status VARCHAR(50) DEFAULT 'draft', -- draft, pending_approval, approved, rejected
    approved_by INTEGER REFERENCES users(id),
    approved_at TIMESTAMP,

    -- Version Control
    parent_document_id INTEGER REFERENCES project_documents(id), -- Previous version
    is_latest_version BOOLEAN DEFAULT true,
    version_notes TEXT,

    -- Tracking
    uploaded_by INTEGER REFERENCES users(id) NOT NULL,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 5. AUDIT TRAIL / TRACEABILITY SYSTEM
-- ============================================================================

-- Comprehensive Audit Log
CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,

    -- Who & When
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, -- NULL if system action
    username VARCHAR(255), -- Denormalized for historical record
    action_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,

    -- What Action
    action_type VARCHAR(50) NOT NULL, -- CREATE, UPDATE, DELETE, APPROVE, REJECT, SUBMIT, VIEW, EXPORT, LOGIN, LOGOUT
    table_name VARCHAR(100) NOT NULL, -- Which table was affected
    record_id INTEGER, -- ID of the affected record

    -- Details
    action_description TEXT, -- Human-readable description
    old_values JSONB, -- Previous state (for updates/deletes)
    new_values JSONB, -- New state (for creates/updates)
    changed_fields TEXT[], -- Array of field names that changed

    -- Context
    ip_address VARCHAR(45), -- IPv4 or IPv6
    user_agent TEXT, -- Browser/client info
    session_id VARCHAR(255), -- Session identifier
    request_method VARCHAR(10), -- GET, POST, PUT, DELETE
    request_url TEXT, -- API endpoint called

    -- Business Context
    project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
    expense_id INTEGER REFERENCES expenses(id) ON DELETE SET NULL,
    change_request_id INTEGER REFERENCES project_change_requests(id) ON DELETE SET NULL,

    -- Result
    action_status VARCHAR(50) DEFAULT 'success', -- success, failure, partial
    error_message TEXT, -- If action failed

    -- Additional metadata
    metadata JSONB, -- Flexible storage for additional context

    -- Indexes for fast querying
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Audit Log for Specific Entities (denormalized for performance)
CREATE TABLE IF NOT EXISTS project_audit_trail (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action_type VARCHAR(50) NOT NULL,
    field_name VARCHAR(100), -- Which field changed
    old_value TEXT,
    new_value TEXT,
    description TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(45)
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Phases & Milestones
CREATE INDEX IF NOT EXISTS idx_project_phases_project_id ON project_phases(project_id);
CREATE INDEX IF NOT EXISTS idx_project_phases_status ON project_phases(status);
CREATE INDEX IF NOT EXISTS idx_project_milestones_project_id ON project_milestones(project_id);
CREATE INDEX IF NOT EXISTS idx_project_milestones_phase_id ON project_milestones(phase_id);
CREATE INDEX IF NOT EXISTS idx_project_milestones_planned_date ON project_milestones(planned_date);
CREATE INDEX IF NOT EXISTS idx_wbs_elements_phase_id ON project_wbs_elements(phase_id);

-- Change Requests
CREATE INDEX IF NOT EXISTS idx_change_requests_project_id ON project_change_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_change_requests_status ON project_change_requests(status);
CREATE INDEX IF NOT EXISTS idx_change_requests_requested_by ON project_change_requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_change_requests_change_number ON project_change_requests(change_number);
CREATE INDEX IF NOT EXISTS idx_change_approvals_cr_id ON change_request_approvals(change_request_id);
CREATE INDEX IF NOT EXISTS idx_change_approvals_approver ON change_request_approvals(approver_id);

-- Templates
CREATE INDEX IF NOT EXISTS idx_project_templates_code ON project_templates(template_code);
CREATE INDEX IF NOT EXISTS idx_project_templates_industry ON project_templates(industry);
CREATE INDEX IF NOT EXISTS idx_template_phases_template_id ON template_phases(template_id);
CREATE INDEX IF NOT EXISTS idx_template_wbs_template_id ON template_wbs_elements(template_id);
CREATE INDEX IF NOT EXISTS idx_template_milestones_template_id ON template_milestones(template_id);
CREATE INDEX IF NOT EXISTS idx_projects_template_id ON projects(template_id);

-- Documents
CREATE INDEX IF NOT EXISTS idx_project_documents_project_id ON project_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_project_documents_phase_id ON project_documents(phase_id);
CREATE INDEX IF NOT EXISTS idx_project_documents_cr_id ON project_documents(change_request_id);
CREATE INDEX IF NOT EXISTS idx_project_documents_type ON project_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_project_documents_uploaded_by ON project_documents(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_project_documents_tags ON project_documents USING GIN(tags);

-- Audit Trail
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action_type ON audit_log(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_log_table_name ON audit_log(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_log_record_id ON audit_log(record_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(action_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_project_id ON audit_log(project_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_expense_id ON audit_log(expense_id);
CREATE INDEX IF NOT EXISTS idx_project_audit_project_id ON project_audit_trail(project_id);
CREATE INDEX IF NOT EXISTS idx_project_audit_timestamp ON project_audit_trail(timestamp DESC);

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE project_phases IS 'Project phases for stage-gate process (similar to SAP PS phases)';
COMMENT ON TABLE project_milestones IS 'Key project milestones and deliverables';
COMMENT ON TABLE project_change_requests IS 'Change request management with impact analysis';
COMMENT ON TABLE change_request_approvals IS 'Multi-level approval workflow for change requests';
COMMENT ON TABLE project_templates IS 'Reusable project blueprints for standardization';
COMMENT ON TABLE template_phases IS 'Default phases for project templates';
COMMENT ON TABLE template_wbs_elements IS 'Default WBS elements for project templates';
COMMENT ON TABLE template_milestones IS 'Default milestones for project templates';
COMMENT ON TABLE project_documents IS 'Document management with version control';
COMMENT ON TABLE audit_log IS 'Comprehensive audit trail for all system actions';
COMMENT ON TABLE project_audit_trail IS 'Project-specific audit trail for quick access';

COMMENT ON COLUMN project_phases.gate_approval_required IS 'Whether this phase requires gate approval to proceed (Go/No-Go)';
COMMENT ON COLUMN project_milestones.is_critical_path IS 'Whether this milestone is on the critical path';
COMMENT ON COLUMN project_change_requests.impact_budget IS 'Budget increase (positive) or decrease (negative)';
COMMENT ON COLUMN project_documents.parent_document_id IS 'Reference to previous version for version control';
COMMENT ON COLUMN audit_log.old_values IS 'JSON snapshot of record before change';
COMMENT ON COLUMN audit_log.new_values IS 'JSON snapshot of record after change';

# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Employees, managers, and admins at Yeems Coffee (internal company tool, not sold externally). Employees submit expenses and shop the vendor marketplace/cart; managers and admins approve/reject spend, manage cost centers, projects, and vendors, and configure approval rules. A `developer` role also exists in the codebase alongside `admin`/`manager`/`employee` for elevated technical access.

## Product Purpose

ExpenseHub is Yeems Coffee's internal procurement and expense management system: submit and track expenses, shop a multi-vendor marketplace (including Amazon Business), route spend through approval workflows, and keep accounting synced to Xero. Success is faster, lower-friction procurement and expense approval with accurate project/cost-center accounting, replacing ad hoc or spreadsheet-based processes.

## Positioning

Positioned as lighter-weight than enterprise tools like SAP Concur, without giving up approval rigor. The differentiators a generic expense tool (e.g. Expensify) doesn't match:

- **Project/WBS-based cost tracking** — cost centers, project phases, and WBS elements tie spend to specific projects, not just flat expense categories.
- **Native Amazon Business punchout + Xero sync** — order directly through Amazon Business punchout and sync accounting data straight to Xero, cutting manual re-entry.
- **Lighter-weight than enterprise suites** — sized for a smaller team, not an SAP Concur-scale deployment.

## Operating Context

Company: Yeems Coffee. Workflows include: browsing the vendor marketplace and Amazon Business punchout, cart checkout, expense submission and approval (including org-chart-based and rule-based approval routing), project/phase/WBS-based cost tracking, cost center and location management, change request handling, audit trail review, and Xero accounting sync.

## Capabilities and Constraints

- React (Create React App) frontend, Node/Express backend, PostgreSQL database.
- Role-based access: `employee`, `manager`, `admin`, and `developer`.
- Integrations: Amazon Business punchout (cXML), Xero accounting sync.
- Project accounting features: cost centers, project phases, WBS elements, change requests, project templates, project documents.
- Deployed on Render (see `render.yaml`) as a combined backend+frontend web service with a managed Postgres instance.

## Brand Commitments

- Product name **ExpenseHub** is fixed — do not rename.
- Current visual palette: Myrtle (`#2B4628`, deep green, primary/brand), Rum Swizzle (`#F2ECD4`, warm cream, background/secondary surface), Light Blue (`#BCD7DE`, accent/info/focus). Established via a recent full UI redesign (`design-tokens.css`) — treat as a confirmed brand commitment, not an open decision.
- Role structure (Employee / Manager / Admin, plus Developer) is fixed — do not restructure access tiers.

## Evidence on Hand

No customer testimonials, case studies, or external press exist — this is an internal tool. Sample/seed data in the database (vendors, cost centers, products) is placeholder data for development, not real evidence to present as product proof.

## Product Principles

1. Keep procurement and expense workflows lighter-weight than enterprise suites (SAP Concur-class tools) while preserving real approval rigor.
2. Tie spend to projects and cost centers (WBS-based accounting), not just flat expense categories.
3. Minimize manual re-entry by integrating directly with Amazon Business (punchout) and Xero (accounting sync).
4. This is an internal tool for Yeems Coffee employees — design and copy should assume a known, trusted internal audience, not anonymous public visitors.

## Accessibility & Inclusion

No product-specific accessibility requirement has been established yet.

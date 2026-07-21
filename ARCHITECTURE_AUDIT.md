# CRM Pro — Complete Architecture Audit Report
**Date:** July 21, 2026  
**Scope:** Read-only analysis. No code, files, or database have been modified.  
**Purpose:** Assess the current architecture, identify reusable vs. industry-specific modules, surface tight coupling, and recommend the minimum changes needed to make this a Universal Business CRM.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Folder Structure Map](#2-folder-structure-map)
3. [Database Schema — Full Inventory](#3-database-schema--full-inventory)
4. [API Endpoints — Full Inventory](#4-api-endpoints--full-inventory)
5. [Authentication & Authorization System](#5-authentication--authorization-system)
6. [Frontend Modules & Navigation](#6-frontend-modules--navigation)
7. [Core Reusable Modules](#7-core-reusable-modules)
8. [Industry-Specific Modules](#8-industry-specific-modules)
9. [Tight Coupling Catalogue](#9-tight-coupling-catalogue)
10. [Database Tables Needing Business-Level Configuration](#10-database-tables-needing-business-level-configuration)
11. [Multi-Business-Type Support Assessment](#11-multi-business-type-support-assessment)
12. [Minimum Architectural Changes for a Universal CRM](#12-minimum-architectural-changes-for-a-universal-crm)
13. [Summary Risk Matrix](#13-summary-risk-matrix)

---

## 1. Project Overview

**Name:** CRM Pro  
**Architecture Pattern:** pnpm Monorepo → Dual Artifact (Frontend + API Server) + Shared Libraries  
**Primary Market Target (current):** Indian B2B sales teams / digital agencies  

### Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, TanStack Query, Wouter |
| Backend | Express.js, TypeScript, Pino (logging) |
| Database | PostgreSQL via Supabase (Auth + DB), Row Level Security |
| ORM | Drizzle ORM (schema file is currently a placeholder — see §9) |
| API Spec | OpenAPI 3.0 / Orval codegen (spec currently minimal — see §9) |
| Auth | Supabase Auth (email/password) + custom SECURITY DEFINER RPCs |
| Communication | WhatsApp Cloud API (Meta, v20.0) |
| AI | LLM integration via `artifacts/api-server/src/routes/ai.ts` |
| Deployment | Replit (dual workflow: port 3000 + 8080) |

---

## 2. Folder Structure Map

```
/ (project root)
├── artifacts/
│   ├── api-server/                  ← Express backend (port 8080)
│   │   └── src/
│   │       ├── app.ts               ← Express app setup, middleware
│   │       ├── index.ts             ← Server entry point
│   │       ├── routes/
│   │       │   ├── ai.ts            ← AI summary / WhatsApp reply generation
│   │       │   ├── health.ts        ← GET /health
│   │       │   ├── index.ts         ← Route aggregator
│   │       │   ├── proposals.ts     ← Proposal CRUD + email send
│   │       │   ├── users.ts         ← User invite / role management
│   │       │   ├── webhooks.ts      ← External webhook → lead ingestion
│   │       │   ├── whatsapp.ts      ← WhatsApp conversations + messages
│   │       │   ├── whatsapp-campaigns.ts ← Campaign CRUD + dispatch
│   │       │   ├── whatsapp-queue.ts     ← Queue worker control
│   │       │   └── whatsapp-webhook.ts   ← Inbound Meta webhook handler
│   │       └── lib/
│   │           ├── auth.ts          ← JWT/session middleware, role helpers
│   │           ├── supabase.ts      ← Supabase admin client
│   │           └── whatsapp-queue-processor.ts ← Background job runner
│   │
│   └── crm-dashboard/               ← React frontend (port 3000)
│       └── src/
│           ├── App.tsx              ← Router + ProtectedRoute + RoleRouter
│           ├── main.tsx
│           ├── contexts/
│           │   ├── AuthContext.tsx  ← Session, profile, role derivations
│           │   ├── LeadsContext.tsx ← Leads CRUD + real-time state
│           │   ├── TasksContext.tsx ← Tasks/follow-ups state
│           │   └── UserContext.tsx  ← User settings
│           ├── pages/
│           │   ├── AdminPage.tsx
│           │   ├── AnalyticsPage.tsx
│           │   ├── CallLogPage.tsx
│           │   ├── ClientPortal.tsx
│           │   ├── Dashboard.tsx
│           │   ├── HRPage.tsx
│           │   ├── Integrations.tsx
│           │   ├── InvoicePage.tsx
│           │   ├── LeadsPage.tsx
│           │   ├── LoginPage.tsx
│           │   ├── PipelineView.tsx
│           │   ├── ProposalPage.tsx
│           │   ├── PublicLeadForm.tsx  ← Embeddable (no auth)
│           │   ├── SettingsPage.tsx
│           │   ├── SocialMediaPage.tsx
│           │   ├── TasksPage.tsx
│           │   ├── TelecallerPage.tsx
│           │   ├── UnauthorizedPage.tsx
│           │   ├── UsersPage.tsx
│           │   ├── WebsiteProjectDetailPage.tsx
│           │   ├── WebsiteProjectsPage.tsx
│           │   ├── WhatsAppCampaignsPage.tsx
│           │   └── WhatsAppPage.tsx
│           ├── components/
│           │   ├── layout/          ← DashboardLayout, Sidebar, ProtectedRoute
│           │   └── ui/              ← shadcn/ui primitives
│           └── hooks/
│               ├── useWhatsApp.ts
│               └── useWhatsAppRealtime.ts
│
├── lib/                             ← Shared libraries
│   ├── api-spec/openapi.yaml        ← Minimal spec (health check only — see §9)
│   ├── api-client-react/            ← Orval-generated React Query hooks
│   ├── api-zod/                     ← Orval-generated Zod schemas
│   └── db/src/schema/index.ts       ← Drizzle schema (EMPTY placeholder — see §9)
│
├── supabase/
│   ├── migrations/                  ← 26 SQL migration files (source of truth)
│   └── migration.sql                ← Aggregated migration (initial schema)
│
└── scripts/post-merge.sh
```

---

## 3. Database Schema — Full Inventory

The database is a **multi-tenant PostgreSQL** instance managed by Supabase. All tables carry `company_id` and are protected by Row Level Security (RLS). The schema lives entirely in SQL migration files (26 migrations).

### 3.1 Tenant & Identity

| Table | Key Columns | Constraints / Notes |
|---|---|---|
| `companies` | `id (UUID PK)`, `name`, `slug (UNIQUE)`, `plan`, `address`, `gst_number`, `email`, `phone`, `website`, `logo_url` | `plan CHECK IN ('free','starter','pro','enterprise')` |
| `user_profiles` | `id (UUID PK → auth.users)`, `company_id (→ companies)`, `full_name`, `avatar_url`, `role` | `role` is `app_role` ENUM |
| `pending_invites` | `id`, `company_id`, `email`, `role`, `invited_by`, `status` | `status CHECK IN ('pending','accepted','expired')` |

**ENUMs defined at DB level:**
```sql
CREATE TYPE public.app_role AS ENUM (
  'super_admin', 'company_admin', 'manager', 'employee'
);
```

### 3.2 CRM & Sales

| Table | Key Columns | Hardcoded Constraints |
|---|---|---|
| `leads` | `id (BIGSERIAL)`, `company_id`, `name`, `email`, `phone`, `status`, `source`, `assigned_to`, `added_at`, `last_activity_at` | `status CHECK IN ('New','Interested','Demo Scheduled','Closed')` · `source CHECK IN ('WhatsApp','Website','IndiaMart','JustDial','Social Media')` |
| `tasks` | `id (BIGSERIAL)`, `company_id`, `lead_id (→ leads)`, `lead_name`, `lead_phone`, `follow_up_date`, `follow_up_time`, `note`, `done (BOOLEAN)` | None beyond FK |
| `proposals` | `id (UUID)`, `company_id`, `lead_id`, `proposal_number`, `client_name`, `client_email`, `client_phone`, `status`, `subtotal`, `tax`, `total`, `notes`, `validity_date`, `expiry_date`, `metadata (JSONB)`, `created_by`, `deleted_at` | `status CHECK IN ('Draft','Sent','Accepted','Rejected','Expiry')` |
| `proposal_items` | `id`, `proposal_id`, `description`, `quantity`, `unit_price`, `amount`, `sort_order` | — |
| `proposal_activity` | `id`, `proposal_id`, `action`, `old_value (JSONB)`, `new_value (JSONB)`, `performed_by` | — |
| `invoices` | `id (UUID)`, `company_id`, `invoice_number`, `client_name`, `amount`, `status`, `due_date` | `status CHECK IN ('Paid','Pending','Overdue')` |
| `call_logs` | `id (BIGSERIAL)`, `company_id`, `lead_id`, `lead_name`, `lead_phone`, `called_by`, `called_by_name`, `called_at`, `duration_seconds`, `outcome`, `follow_up_date`, `notes` | No hardcoded CHECK on outcome |

### 3.3 HR & Operations

| Table | Key Columns | Hardcoded Constraints |
|---|---|---|
| `employees` | `id (UUID)`, `company_id`, `full_name`, `role (TEXT)`, `join_date`, `salary_info` | Free-text role (not ENUM) |
| `attendance` | `id`, `employee_id`, `company_id`, `date`, `status`, `check_in`, `check_out` | `status CHECK IN ('Present','Absent','On-Leave')` · UNIQUE `(employee_id, date)` |

> **No `leave_requests` table exists in migrations** — HR is attendance-only at the DB level.

### 3.4 Project Management (Agency-Specific)

| Table | Key Columns | Hardcoded Constraints |
|---|---|---|
| `website_projects` | `id (UUID)`, `company_id`, `project_name`, `client`, `website_type`, `status`, `assigned_to`, `deadline` | `status CHECK IN ('Planning','In Progress','Review','Completed','On Hold')` |
| `website_project_tasks` | `id`, `project_id`, `title`, `status`, `assigned_to`, `due_date` | `status CHECK IN ('Todo','In Progress','Done')` |

### 3.5 Client Relations

| Table | Key Columns | Notes |
|---|---|---|
| `client_documents` | `id`, `company_id`, `client_name`, `file_url`, `document_type`, `uploaded_by` | — |
| `support_tickets` | `id`, `company_id`, `subject`, `description`, `status`, `priority`, `created_by` | — |
| `client_notifications` | `id`, `company_id`, `recipient_email`, `message`, `sent_at` | — |

### 3.6 WhatsApp Communications

| Table | Key Columns | Notes |
|---|---|---|
| `whatsapp_conversations` | `id`, `company_id`, `contact_name`, `contact_phone`, `status`, `last_message_at`, `wa_account_id` | `status CHECK IN ('active','archived','blocked')` |
| `whatsapp_messages` | `id`, `conversation_id`, `company_id`, `direction`, `message_type`, `content`, `media_url`, `status`, `wa_message_id`, `timestamp` | `status CHECK IN ('pending','sent','delivered','read','failed')` |
| `whatsapp_templates` | `id`, `company_id`, `name`, `language`, `category`, `components (JSONB)`, `wa_template_id`, `status` | — |
| `whatsapp_queue` | `id`, `company_id`, `conversation_id`, `template_id`, `payload (JSONB)`, `status`, `scheduled_at`, `processed_at`, `error` | — |
| `whatsapp_campaigns` | `id`, `company_id`, `name`, `template_id`, `status`, `target_filter (JSONB)`, `sent_count`, `failed_count`, `started_at`, `completed_at` | `status CHECK IN ('draft','running','completed','cancelled')` |

### 3.7 Company Configuration

| Table | Key Columns | Notes |
|---|---|---|
| `company_branding` | Columns added directly to `companies`: `email`, `phone`, `website`, `logo_url` | Merged into companies table via migration 000017 |
| `settings` | Per-company settings (structure from migration 000004) | Used for admin configuration |

### 3.8 DB-Level Functions & Triggers

| Function | Purpose |
|---|---|
| `get_my_company_id()` | Returns `company_id` of the current `auth.uid()` — used in all RLS policies |
| `get_my_role()` | Returns `app_role` of the current user — used in write RLS policies |
| `set_updated_at()` | Trigger function: auto-sets `updated_at` on all tables |
| `handle_new_user()` | Trigger on `auth.users INSERT`: creates bare `user_profiles` row with `role='employee'` |
| `onboard_user()` | SECURITY DEFINER RPC: upserts profile, auto-assigns company, sets role; called on every login |
| `ensure_profile_fn()` | Ensures profile exists; used as safety net |

---

## 4. API Endpoints — Full Inventory

### Backend Routes (`artifacts/api-server/src/routes/`)

#### Health
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/health` | None | Returns `{ status: "ok" }` |

#### AI (`ai.ts`)
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/ai/lead-summary` | Session | Generates lead summary using LLM; reads tasks, proposals, WA messages |
| POST | `/api/ai/whatsapp-reply` | Session | Suggests WhatsApp reply; hardcodes ₹ currency, IndiaMart/JustDial source handling |

#### Proposals (`proposals.ts`)
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/proposals` | Session | List proposals for company |
| POST | `/api/proposals` | Session | Create proposal |
| GET | `/api/proposals/:id` | Session | Get single proposal |
| PATCH | `/api/proposals/:id` | Session | Update proposal |
| DELETE | `/api/proposals/:id` | Session (manager+) | Soft delete |
| POST | `/api/proposals/:id/send` | Session (manager+) | Send via email; hardcodes "CRM Pro" brand in HTML template |

#### Users (`users.ts`)
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/users/invite` | Session (admin) | Invite user by email + role |
| GET | `/api/users` | Session | List company users |
| PATCH | `/api/users/:id/role` | Session (admin) | Change user role |
| DELETE | `/api/users/:id` | Session (admin) | Remove user |

#### Webhooks (`webhooks.ts`)
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/webhooks/lead` | API Key | Ingest lead from external source; hardcodes `TELECALLER_POOL` with 2 user IDs |

#### WhatsApp (`whatsapp.ts`)
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/whatsapp/conversations` | Session | List conversations |
| GET | `/api/whatsapp/conversations/:id/messages` | Session | Get messages |
| POST | `/api/whatsapp/send` | Session | Send message |
| POST | `/api/whatsapp/send-media` | Session | Send media message |
| GET | `/api/whatsapp/templates` | Session | List approved templates |
| POST | `/api/whatsapp/templates/sync` | Session | Sync from Meta API |

#### WhatsApp Campaigns (`whatsapp-campaigns.ts`)
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/whatsapp/campaigns` | Session | List campaigns |
| POST | `/api/whatsapp/campaigns` | Session | Create campaign |
| PATCH | `/api/whatsapp/campaigns/:id` | Session | Update campaign |
| POST | `/api/whatsapp/campaigns/:id/start` | Session | Start campaign |
| POST | `/api/whatsapp/campaigns/:id/cancel` | Session | Cancel campaign |

#### WhatsApp Queue (`whatsapp-queue.ts`)
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/whatsapp/queue/process` | Session (admin) | Manually trigger queue processing |

#### WhatsApp Webhook (`whatsapp-webhook.ts`)
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/webhooks/whatsapp` | None (Meta verify token) | Webhook verification handshake |
| POST | `/api/webhooks/whatsapp` | None (Meta signature) | Inbound message / status update handler |

---

## 5. Authentication & Authorization System

### 5.1 Auth Flow

```
User Login (email/password)
    └─ Supabase Auth → JWT token issued
         └─ Frontend: onboard_user() RPC called on every session start
              └─ Upserts user_profiles + assigns company + sets role
                   └─ profile.role drives ALL feature access
```

### 5.2 Role Hierarchy

```
super_admin          ← Platform-level (can see all companies — though no admin UI for this yet)
  └─ company_admin   ← Full access within their company
       └─ manager    ← Can manage leads, HR, proposals; cannot manage users
            └─ employee  ← "Telecaller" — restricted to assigned leads; masked phone numbers
```

### 5.3 Role Enforcement Points

| Layer | Mechanism | Details |
|---|---|---|
| Database | RLS policies | All SELECT/INSERT/UPDATE/DELETE gated by `get_my_company_id()` + `get_my_role()` |
| API Server | `auth.ts` middleware | JWT validation; `requireRole(['super_admin','company_admin'])` guard |
| Frontend Router | `<ProtectedRoute>` | Redirects unauthenticated users to `/login` |
| Frontend Router | `<RoleRouter>` | Redirects `employee` role to `/telecaller` view |
| Frontend UI | `isAdmin` / `isTelecaller` flags | Show/hide buttons, mask phone numbers, restrict downloads |

### 5.4 Key Coupling: The `isTelecaller` Alias

In `AuthContext.tsx` (line 189):
```typescript
const isTelecaller = profile?.role === "employee"; // "employee" = old "Telecaller"
```

The `employee` role is permanently semantically mapped to "Telecaller" throughout the entire frontend. This is a **significant naming/semantic coupling** that makes the role system misleading for any non-sales business type (a Gym receptionist, a Clinic nurse, a Restaurant waiter — all would be classified as "Telecallers").

---

## 6. Frontend Modules & Navigation

### 6.1 Route Map

| Route | Component | Role Access | Notes |
|---|---|---|---|
| `/login` | `LoginPage` | Public | — |
| `/lead-form` | `PublicLeadForm` | Public | Embeddable iframe |
| `/unauthorized` | `UnauthorizedPage` | Any | — |
| `/` | `RoleRouter` | Authenticated | Redirects by role |
| `/leads` | `LeadsPage` | All roles | employees see only assigned leads |
| `/pipeline` | `PipelineView` | All roles | Kanban board |
| `/telecaller` | `TelecallerPage` | employee redirect | Simplified view |
| `/call-log` | `CallLogPage` | All roles | — |
| `/tasks` | `TasksPage` | All roles | — |
| `/proposals` | `ProposalPage` | All roles | — |
| `/whatsapp` | `WhatsAppPage` | All roles | — |
| `/whatsapp/campaigns` | `WhatsAppCampaignsPage` | All roles | — |
| `/social-media` | `SocialMediaPage` | All roles | — |
| `/hr` | `HRPage` | All roles | Write restricted to manager+ |
| `/website-projects` | `WebsiteProjectsPage` | All roles | **Agency-specific** |
| `/website-projects/:id` | `WebsiteProjectDetailPage` | All roles | **Agency-specific** |
| `/client-portal` | `ClientPortal` | All roles | — |
| `/analytics` | `AnalyticsPage` | isAdmin only | — |
| `/invoices` | `InvoicePage` | isAdmin only | — |
| `/admin` | `AdminPage` | isAdmin only | — |
| `/users` | `UsersPage` | isAdmin only | — |
| `/integrations` | `Integrations` | isAdmin only | — |
| `/settings` | `SettingsPage` | isAdmin only | — |

### 6.2 Sidebar Navigation

The sidebar is a **static, hardcoded list** of all modules. There is **no per-company module toggle** — every company sees the same navigation. A Gym using this CRM today would see "Website Projects" and "WhatsApp Campaigns" even if they don't use them.

### 6.3 Hardcoded UI Values

| Location | Values |
|---|---|
| `LeadsContext.tsx` — lead statuses | `New`, `Interested`, `Demo Scheduled`, `Closed` |
| `LeadsContext.tsx` — lead sources | `WhatsApp`, `Website`, `IndiaMart`, `JustDial`, `Social Media` |
| `WebsiteProjectsPage.tsx` — website types | `Landing Page`, `Corporate Website`, `E-Commerce`, `Portfolio`, `Blog`, `Web Application`, `Other` |
| `WebsiteProjectsPage.tsx` — project statuses | `Planning`, `In Progress`, `Review`, `Completed`, `On Hold` |
| `HRPage.tsx` — attendance statuses | `Present`, `Absent`, `On-Leave` |
| `InvoicePage.tsx` — invoice statuses | `Paid`, `Pending`, `Overdue` |
| `WhatsAppCampaignsPage.tsx` — campaign statuses | `draft`, `running`, `completed`, `cancelled` |

---

## 7. Core Reusable Modules

These modules are **industry-agnostic** and can serve any business type without modification.

### ✅ Multi-Tenancy Foundation
- `companies` + `user_profiles` tables
- `get_my_company_id()` / `get_my_role()` RLS helpers
- `onboard_user()` RPC (auto company creation)
- **Reusability:** 10/10 — pure infrastructure, no business logic

### ✅ Authentication & Role System
- Supabase Auth + JWT middleware
- 4-tier role hierarchy (super_admin → company_admin → manager → employee)
- `ProtectedRoute` / `RoleRouter` components
- **Reusability:** 8/10 — role names are generic enough; only `isTelecaller` alias is a problem

### ✅ Lead / Contact Management
- `leads` table, pipeline view, CRUD operations
- `LeadsPage`, `PipelineView`, `TelecallerPage`
- Task/follow-up system tied to leads
- **Reusability:** 7/10 — the concept of a "lead" is universal; statuses and sources are hardcoded (see §9)

### ✅ Task & Follow-up System
- `tasks` table, `TasksPage`, `TasksContext`
- Works independently of lead module
- **Reusability:** 9/10 — generic enough for any workflow

### ✅ Proposals & Estimates
- `proposals`, `proposal_items`, `proposal_activity` tables
- PDF generation, email send, activity log
- **Reusability:** 8/10 — universal concept; "CRM Pro" brand in email template is hardcoded

### ✅ Invoicing
- `invoices` table, `InvoicePage`
- Simple status lifecycle (Pending → Paid / Overdue)
- **Reusability:** 8/10 — universal; statuses may need extension for some business types

### ✅ Call Logging
- `call_logs` table, `CallLogPage`
- Records calls with outcome, duration, follow-up date
- **Reusability:** 8/10 — useful for any business with phone-based customer contact

### ✅ User & Team Management
- `pending_invites`, `UsersPage`, `AdminPage`
- Role-based invite system
- **Reusability:** 9/10 — generic team management

### ✅ Company Settings & Branding
- `companies` columns (logo_url, email, phone, website)
- `SettingsPage`, company branding on proposals/invoices
- **Reusability:** 10/10 — pure infrastructure

### ✅ Analytics Dashboard
- `AnalyticsPage` — metrics over leads, tasks, revenue
- **Reusability:** 7/10 — metrics are currently lead/revenue-centric; needs to be data-source agnostic

### ✅ Client Portal
- `ClientPortal`, `client_documents`, `support_tickets`, `client_notifications`
- **Reusability:** 9/10 — useful for any service business with external clients

### ✅ Public Lead Capture Form
- `PublicLeadForm` — embeddable, no-auth lead intake
- **Reusability:** 8/10 — concept is universal; lead sources are hardcoded

### ✅ WhatsApp Communications
- Full WhatsApp Cloud API integration (conversations, templates, campaigns, queue)
- **Reusability:** 7/10 — the channel is universal; Meta API coupling is expected and acceptable

### ✅ AI Assistant
- Lead summary + WhatsApp reply generation via LLM
- **Reusability:** 5/10 — prompts hardcode Indian context (₹, IndiaMart); needs to be configurable

---

## 8. Industry-Specific Modules

These modules are **tightly bound to one business type** and either don't translate to other industries or need significant rethinking.

### ❌ Website Projects Module (`website_projects`, `website_project_tasks`)
**Why it's industry-specific:**
- Table name, columns (`website_type`), and status workflow (`Planning → In Progress → Review → Completed`) are all specific to web/software development agencies.
- UI options: `Landing Page`, `Corporate Website`, `E-Commerce`, etc. are meaningless to a Gym or Restaurant.
- **Impact on expansion:** A Gym would call this "Membership Plans". A Restaurant would call this "Event Bookings". A Clinic would call this "Patient Cases". The concept is a generic "Projects" module, but it is modeled and named as agency-specific.

### ❌ Telecaller / BPO Workflow
**Why it's industry-specific:**
- `TelecallerPage` provides a simplified view for outbound calling agents.
- `isTelecaller` as an alias for `employee` assumes the primary use of a non-manager employee is outbound calling.
- `TELECALLER_POOL` with hardcoded user IDs in `webhooks.ts` assumes a fixed set of sales callers.
- **Impact on expansion:** A Gym receptionist is not a telecaller. A Restaurant server is not a telecaller. This mapping creates semantic confusion in a universal context.

### ❌ Indian Lead Sources (`IndiaMart`, `JustDial`)
**Why it's industry-specific:**
- Hard-coded as valid `source` values in the `leads` table CHECK constraint.
- Present in `LeadsContext.tsx`, `webhooks.ts`, and `ai.ts`.
- IndiaMart and JustDial are India-specific B2B marketplaces with no relevance to a US Restaurant, a European Clinic, or a global Retail chain.
- **Impact on expansion:** Any international business type or non-B2B business would need these removed, but can't — they're in a DB CHECK constraint.

### ❌ GST Number (`companies.gst_number`)
**Why it's industry-specific:**
- GST (Goods and Services Tax) is an Indian tax system concept.
- Added as a dedicated column in migration 000026.
- A US Retail store uses EIN, a European business uses VAT. This is a country-specific field.

### ❌ Indian Rupee in AI Prompts (`ai.ts`)
**Why it's industry-specific:**
- The AI route embeds `₹` as the currency symbol in the LLM prompt context.
- A Thai restaurant or a US gym would receive AI suggestions denominated in Rupees.

### ⚠️ HR Module (Partially Industry-Specific)
- **Reusable parts:** Basic employee list, attendance tracking — generic.
- **Agency-specific parts:** No payroll, no shift scheduling, no department management — the current HR module is shaped around a small agency team rather than a Restaurant's shift workers or a Gym's trainer schedule.
- **Verdict:** Reusable as a foundation, but needs extension for most other business types.

### ⚠️ Social Media Page (`SocialMediaPage`)
- Currently exists as a route but was not fully examined. If it is a placeholder for social media scheduling/management, it may be agency-specific. If it is a lead-source tracker, it could be universal.

---

## 9. Tight Coupling Catalogue

This section documents every coupling point that would prevent expansion to new business types, ordered by severity.

### 🔴 CRITICAL — Blocks Multi-Business Support Immediately

#### C1: Lead Status & Source Hardcoded in DB CHECK Constraints
**Files:** `supabase/migrations/20240101000001_multi_tenant_rls.sql` (original `migration.sql`)  
**Code:**
```sql
CHECK (status IN ('New','Interested','Demo Scheduled','Closed'))
CHECK (source IN ('WhatsApp','Website','IndiaMart','JustDial','Social Media'))
```
**Problem:** These CHECK constraints are baked into the database. A Restaurant's lead pipeline might be `Inquiry → Reservation → Seated → Repeat Customer`. A Clinic's might be `New Patient → Consultation → Treatment → Discharged`. Neither fits the current statuses. Adding a new status requires an `ALTER TABLE` migration — impossible to do per-company without removing the constraint entirely.

**Impact:** Every business type gets the same lead lifecycle. The sales funnel is non-configurable.

#### C2: No `company_type` / `business_type` Field Anywhere
**Files:** `companies` table, all frontend contexts, all API routes  
**Problem:** There is zero differentiation between business types in the entire system. A Gym, a Clinic, and a Digital Agency all get the exact same UI, the same modules, the same navigation, and the same AI prompts. There is no branching logic on business type anywhere in the codebase — because the field doesn't exist.

**Impact:** Cannot show/hide modules based on what type of business is using the CRM. Cannot customize terminology (e.g., "Lead" → "Patient" for a clinic, "Member" for a gym).

#### C3: `isTelecaller` Semantic Lock on `employee` Role
**Files:** `artifacts/crm-dashboard/src/contexts/AuthContext.tsx` (line 189)  
**Code:**
```typescript
const isTelecaller = profile?.role === "employee"; // "employee" = old "Telecaller"
```
**Problem:** This 1-to-1 mapping means the `employee` role is conceptually "a person who makes outbound calls" throughout the entire UI. Phone masking, `TelecallerPage` redirect, and feature restrictions are all applied to all non-manager employees. A gym trainer (employee) or a restaurant server (employee) would be routed to a calling-agent interface.

#### C4: Hardcoded Telecaller Pool in Webhook Route
**Files:** `artifacts/api-server/src/routes/webhooks.ts`  
**Code:**
```javascript
const TELECALLER_POOL = [
  { id: "2", name: "Ravi Kumar" },
  { id: "3", name: "Sunita Rao" }
];
```
**Problem:** Lead assignment from external webhooks is hardcoded to two specific users with specific Indian names. This is not configurable per company and will break for any real production deployment.

#### C5: `app_role` as a PostgreSQL ENUM (Non-Extensible)
**Files:** `supabase/migrations/20240101000001_multi_tenant_rls.sql`  
**Code:**
```sql
CREATE TYPE public.app_role AS ENUM (
  'super_admin', 'company_admin', 'manager', 'employee'
);
```
**Problem:** Adding a new role (e.g., `receptionist`, `trainer`, `chef`) requires an `ALTER TYPE ... ADD VALUE` migration — a DDL operation that cannot be undone in PostgreSQL without recreation. This makes the role system inflexible for business types that need different organizational structures.

### 🟠 HIGH — Significantly Limits Expansion

#### C6: Lead Sources Mirrored in Three Layers
The `IndiaMart` and `JustDial` sources appear in:
1. **Database** — `leads.source` CHECK constraint
2. **Frontend** — `LeadsContext.tsx` hardcoded array
3. **API** — `webhooks.ts` VALID_SOURCES array, `ai.ts` SOURCE_INTEREST mapping

Removing them requires synchronized changes across all three layers. A non-Indian business cannot add their own sources without code changes.

#### C7: `website_projects` Module Embedded in Global Navigation
**Files:** `artifacts/crm-dashboard/src/App.tsx`, sidebar component  
**Problem:** The Website Projects module (with its agency-specific domain) is always visible to all companies. A Gym admin sees "Website Projects" in their sidebar despite it being irrelevant to their business. There is no module enable/disable mechanism.

#### C8: Currency and Locale Hardcoded in AI Prompts
**Files:** `artifacts/api-server/src/routes/ai.ts`  
**Problem:** The LLM context strings embed `₹` (Indian Rupee) and Indian-specific lead source context. Any non-Indian company will receive AI-generated content with the wrong currency and irrelevant market context.

#### C9: `companies.plan` as a CHECK Constraint
**Files:** `supabase/migrations/20240101000001_multi_tenant_rls.sql`  
**Code:**
```sql
plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free','starter','pro','enterprise'))
```
**Problem:** Plan tiers are baked in as a database constraint. Adding a new plan (e.g., `clinic_basic`, `gym_pro`) requires a migration. More critically, plan is **never used to gate features in the UI or API** — it's stored but ignored. This means the subscription/plan infrastructure exists but has no functional effect.

#### C10: "CRM Pro" Brand in Email Templates
**Files:** `artifacts/api-server/src/routes/proposals.ts`  
**Problem:** The HTML email template for proposal sending hardcodes "CRM Pro" as the product name and signature. If this becomes a white-labeled universal CRM, every proposal email will expose the platform's own brand name.

#### C11: Meta API Version Hardcoded
**Files:** `artifacts/api-server/src/routes/whatsapp.ts`  
**Code:** `v20.0` is hardcoded in the Meta API base URL  
**Problem:** When Meta releases a new API version, the code must be edited rather than configured. Not a multi-business-type issue, but a maintenance coupling.

### 🟡 MEDIUM — Structural / Maintainability Issues

#### C12: Drizzle ORM Schema is an Empty Placeholder
**Files:** `lib/db/src/schema/index.ts`  
**Problem:** The file contains only commented-out boilerplate and exports nothing. The actual database schema exists **only in SQL migration files**, not in the Drizzle TypeScript schema. This means:
- No TypeScript type safety on database queries from shared libraries
- The `lib/db` package provides no value — all DB access goes through raw Supabase client calls
- `lib/api-client-react` and `lib/api-zod` are generated from the OpenAPI spec, which is also nearly empty

**Impact:** The monorepo's shared-library architecture promises type-safe, spec-driven development but is not realized. All type safety comes from ad-hoc TypeScript interfaces defined inline in individual files.

#### C13: OpenAPI Spec is Nearly Empty
**Files:** `lib/api-spec/openapi.yaml`  
**Problem:** The spec defines only a `HealthStatus` model. None of the 20+ actual API endpoints are documented in the spec. The `lib/api-client-react` generated hooks therefore cover nothing. All frontend API calls go through raw `fetch` or direct Supabase client calls, bypassing the codegen infrastructure entirely.

**Impact:** The Orval/OpenAPI toolchain is set up but unused. Any developer adding an endpoint must also manually maintain the spec — but currently no one is.

#### C14: `company.plan` Not Enforced — Module Access is Ungated
**Problem:** The `plan` field on `companies` is stored and displayed in `SettingsPage` but never read by any API route or UI component to gate access to features. A `free` plan company has identical access to an `enterprise` plan company.

---

## 10. Database Tables Needing Business-Level Configuration

These tables contain values that should be **configurable per company** or **per business type**, rather than hardcoded.

| Table | Column | Current State | Should Be |
|---|---|---|---|
| `leads` | `status` | CHECK: 4 hardcoded values | Company-configurable pipeline stages |
| `leads` | `source` | CHECK: 5 hardcoded values (2 India-specific) | Company-configurable lead sources |
| `companies` | `plan` | CHECK: 4 hardcoded tier names | Driven by a separate `plans` table |
| `companies` | `gst_number` | India-specific column | Generic `tax_id` with `tax_id_label` configurable per country |
| `website_projects` | `website_type` | Free text (OK), but module itself is always active | Module should only exist for companies with `business_type = 'agency'` or enabled modules |
| `website_projects` | `status` | CHECK: 5 hardcoded values | Should use the same configurable pipeline stage pattern as leads |
| `attendance` | `status` | CHECK: 3 values ('Present','Absent','On-Leave') | Generally acceptable, but 'On-Leave' could need more granularity (Sick, Vacation, etc.) |
| `user_profiles` | `role` | PostgreSQL ENUM (4 values) | Should be TEXT with a `company_roles` configuration table, or ENUM values expanded |

---

## 11. Multi-Business-Type Support Assessment

### Test Matrix: Can the current system serve these business types?

| Business Type | Leads Module | Pipeline | HR | Projects | WhatsApp | Verdict |
|---|---|---|---|---|---|---|
| **Digital Agency** (current) | ✅ | ✅ | ✅ | ✅ | ✅ | **Native** |
| **B2B Sales Team** | ✅ | ✅ | ✅ | ⚠️ | ✅ | **Good fit** |
| **Real Estate Agency** | ⚠️ Lead statuses wrong | ⚠️ | ✅ | ⚠️ | ✅ | **Partial** |
| **Restaurant** | ⚠️ Reservation ≠ Lead | ❌ | ⚠️ Shifts missing | ❌ | ✅ | **Poor** |
| **Gym / Fitness** | ⚠️ Member ≠ Lead | ❌ | ⚠️ Trainer schedules | ❌ | ✅ | **Poor** |
| **Clinic / Healthcare** | ⚠️ Patient ≠ Lead | ❌ | ⚠️ Doctor shifts | ❌ | ✅ | **Poor** |
| **Manufacturing** | ⚠️ Lead ok | ⚠️ | ✅ | ⚠️ (production ≠ website) | ✅ | **Partial** |
| **Retail** | ⚠️ Customer ≠ Lead | ❌ | ✅ | ❌ | ✅ | **Poor** |
| **International Business** | ❌ IndiaMart/JustDial sources | ❌ | ✅ | ⚠️ | ✅ | **Blocked** |

### What Would Break If a Gym Tried to Use This System Today

1. Every employee is labeled a "Telecaller" and redirected to a calling-agent interface
2. The sidebar shows "Website Projects" — irrelevant and confusing
3. Lead statuses (`Interested`, `Demo Scheduled`) don't map to gym sales (`Trial → Member → Inactive`)
4. Lead sources include IndiaMart/JustDial — irrelevant to a gym; cannot be changed
5. AI suggestions come with ₹ currency
6. HR attendance is fine, but no shift scheduling
7. No concept of "membership" or "subscription" tracking
8. The "Telecaller" page is the default landing for all front-desk staff

---

## 12. Minimum Architectural Changes for a Universal CRM

These are the **smallest possible changes** that would unlock multi-business-type support without rewriting the system. They are listed in priority order.

### Change 1: Add `business_type` and `industry` to `companies` *(1 migration, minimal frontend)*

```sql
-- New migration
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS business_type TEXT NOT NULL DEFAULT 'agency',
  ADD COLUMN IF NOT EXISTS industry      TEXT,
  ADD COLUMN IF NOT EXISTS currency_code TEXT NOT NULL DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS locale        TEXT NOT NULL DEFAULT 'en-IN',
  ADD COLUMN IF NOT EXISTS tax_id_label  TEXT DEFAULT 'GST Number';
```

**Why it's minimum:** This single migration creates the anchor that all other business-type logic can branch from. Every module toggle, label override, and AI prompt customization flows from this.

**Frontend impact:** `AuthContext` / `UserContext` would expose `company.business_type`, enabling conditional rendering.

---

### Change 2: Replace `leads.status` and `leads.source` CHECK Constraints with a Configuration Table *(2 migrations + API change)*

```sql
-- Migration: Remove hardcoded constraints, add config table
CREATE TABLE public.pipeline_stages (
  id          UUID PK,
  company_id  UUID → companies,
  module      TEXT NOT NULL,   -- 'leads', 'projects', 'members', etc.
  name        TEXT NOT NULL,
  color       TEXT,
  sort_order  INT,
  is_closed   BOOLEAN DEFAULT false
);

CREATE TABLE public.lead_sources (
  id         UUID PK,
  company_id UUID → companies,
  name       TEXT NOT NULL,
  is_active  BOOLEAN DEFAULT true
);

-- Remove CHECK constraints from leads
ALTER TABLE public.leads
  DROP CONSTRAINT leads_status_check,
  DROP CONSTRAINT leads_source_check;
```

**Why it's minimum:** This is the single highest-impact change. It unlocks custom sales pipelines for every business type (Real Estate, Gym, Clinic, etc.) without touching any existing data. Existing companies get their current values seeded as default stages on first migration.

**Seed data per business type:**
- Agency: `New → Interested → Demo Scheduled → Closed` + sources `WhatsApp, Website, IndiaMart, JustDial, Social Media`
- Gym: `New → Trial → Active Member → Inactive`
- Clinic: `New Inquiry → Consultation → Treatment → Discharged`
- Real Estate: `New Lead → Site Visit → Negotiation → Deal Closed`

---

### Change 3: Add Module Enable/Disable per Company *(1 migration + sidebar change)*

```sql
CREATE TABLE public.enabled_modules (
  company_id  UUID → companies,
  module_key  TEXT NOT NULL,   -- 'website_projects', 'whatsapp', 'hr', 'invoices', etc.
  is_enabled  BOOLEAN DEFAULT true,
  PRIMARY KEY (company_id, module_key)
);
```

**Frontend impact:** The sidebar reads `enabled_modules` and only renders items for enabled modules. Admin settings page allows toggling.

**Why it's minimum:** A single table + one sidebar query replaces all hardcoded module visibility logic. No page component changes required.

**Default modules by business type** (seeded on onboarding):

| Module Key | Agency | Restaurant | Gym | Clinic | Retail |
|---|---|---|---|---|---|
| `leads` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `pipeline` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `tasks` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `proposals` | ✅ | ⬜ | ⬜ | ✅ | ✅ |
| `invoices` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `hr` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `website_projects` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `whatsapp` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `call_log` | ✅ | ⬜ | ⬜ | ✅ | ⬜ |
| `client_portal` | ✅ | ⬜ | ✅ | ✅ | ⬜ |

---

### Change 4: Rename `isTelecaller` → `isFieldAgent` and Decouple from `employee` Role *(Frontend-only)*

**Current:**
```typescript
const isTelecaller = profile?.role === "employee";
```
**Proposed:**
```typescript
const isLimitedAccess = profile?.role === "employee";
// Display label driven by business_type:
// agency → "Telecaller", gym → "Trainer", clinic → "Staff", restaurant → "Server"
```

**Why it's minimum:** This is a pure frontend rename + label lookup. No DB change required. The role system stays as-is; only the semantic labeling changes.

---

### Change 5: Move Hardcoded Values into Company Configuration *(API + Frontend)*

Centralize all currently-hardcoded values into a `company_config` or extend `settings` table:

```sql
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS
  currency_code TEXT DEFAULT 'INR',
  currency_symbol TEXT DEFAULT '₹',
  locale TEXT DEFAULT 'en-IN',
  ai_context_extras JSONB DEFAULT '{}'; -- injected into AI prompts
```

**AI route change:** Read `currency_symbol` and `locale` from company settings before building LLM context. Remove the hardcoded `₹`.

**Webhook route change:** Replace `TELECALLER_POOL` with a DB query for active employees with the `employee` role in the company.

**Proposal email change:** Read company name from `companies.name` instead of hardcoding "CRM Pro".

---

### Change 6: Rename `gst_number` → `tax_id` with Configurable Label *(1 migration + UI)*

```sql
ALTER TABLE public.companies
  RENAME COLUMN gst_number TO tax_id;
-- tax_id_label already added in Change 1
```

**Frontend:** `SettingsPage` shows a configurable label field ("GST Number", "VAT Number", "EIN", "ABN") alongside the value.

---

### Change 7: Replace `companies.plan` CHECK with a `plans` Table or Remove Constraint *(1 migration)*

```sql
-- Option A: Remove the CHECK constraint (simplest)
ALTER TABLE public.companies
  DROP CONSTRAINT companies_plan_check;

-- Option B: Create a plans table and enforce via FK
CREATE TABLE public.plans (
  id TEXT PRIMARY KEY,  -- 'free', 'starter', 'pro', 'enterprise', 'clinic_basic', etc.
  display_name TEXT,
  max_users INT,
  max_modules INT
);
ALTER TABLE public.companies
  ADD CONSTRAINT companies_plan_fk FOREIGN KEY (plan) REFERENCES public.plans(id);
```

**Additionally:** Implement plan-based feature gating in the API middleware and frontend `AuthContext`.

---

### Change 8: Rename `website_projects` → `projects` with a `project_type` field *(1 migration)*

```sql
-- Non-breaking rename at application level (views/aliases)
ALTER TABLE public.website_projects RENAME TO projects;
ALTER TABLE public.website_projects_tasks RENAME TO project_tasks;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS project_type TEXT DEFAULT 'website',
  DROP CONSTRAINT IF EXISTS website_projects_status_check;
```

This turns an agency-specific module into a generic project tracker. A Clinic uses it for patient cases (`project_type = 'case'`), a Restaurant uses it for events (`project_type = 'event'`), a Manufacturing company uses it for orders (`project_type = 'production_order'`).

---

### Summary: Change Roadmap

| # | Change | Effort | Impact | Code Risk |
|---|---|---|---|---|
| 1 | Add `business_type`, `currency`, `locale` to companies | Low | Very High | None (additive) |
| 2 | Replace lead status/source CHECK with config tables | Medium | Very High | Medium (migration) |
| 3 | Module enable/disable table + sidebar query | Medium | Very High | Low |
| 4 | Rename isTelecaller, decouple role label | Low | High | Low (frontend only) |
| 5 | Config-driven AI prompts + webhook pool + email brand | Medium | High | Low |
| 6 | Rename gst_number → tax_id | Low | Medium | Low (additive) |
| 7 | Replace plan CHECK with plans table | Low | Medium | Low (additive) |
| 8 | Rename website_projects → projects | Medium | Medium | Medium (DB rename) |

**Changes 1 + 3 + 4 + 5** can be done without touching any existing data and without breaking any existing functionality. They are purely additive.

**Changes 2, 7, 8** require migrations that ALTER existing table constraints. They need careful execution with backward-compatible default values to protect existing data.

---

## 13. Summary Risk Matrix

| Area | Current State | Risk to Expansion | Priority |
|---|---|---|---|
| Lead status/source | Hardcoded in DB CHECK | 🔴 Blocks every new pipeline | P0 |
| Business type field | Does not exist | 🔴 Cannot differentiate companies | P0 |
| `isTelecaller` alias | All employees = telecallers | 🔴 Wrong UX for non-sales roles | P0 |
| Module visibility | All modules always visible | 🔴 Confusing for irrelevant business types | P0 |
| India-specific sources | IndiaMart/JustDial in DB | 🟠 Blocks international expansion | P1 |
| Hardcoded currency (₹) | In AI prompts | 🟠 Wrong for any non-INR company | P1 |
| Telecaller pool | Hardcoded user IDs | 🟠 Broken for real deployments | P1 |
| website_projects naming | Agency-specific table/module | 🟠 Confuses non-agency users | P1 |
| `gst_number` column | India-specific | 🟡 Minor for other regions | P2 |
| `plan` CHECK constraint | 4 hardcoded tiers | 🟡 Limits plan flexibility | P2 |
| Plan enforcement | Plan stored but never enforced | 🟡 No subscription gating works | P2 |
| "CRM Pro" in emails | Hardcoded brand | 🟡 White-label problem | P2 |
| Drizzle schema empty | No TypeScript DB types | 🟡 Tech debt, not a user issue | P3 |
| OpenAPI spec minimal | Codegen infrastructure unused | 🟡 Tech debt, not a user issue | P3 |
| `app_role` as ENUM | Cannot add roles without migration | 🟡 Manageable short-term | P3 |

---

*This report was generated by static analysis only. No files were created, modified, or deleted. No database changes were made. All findings are based on reading the source files and SQL migrations as they exist in the repository.*

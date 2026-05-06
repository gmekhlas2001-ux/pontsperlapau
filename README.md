# PXP Management System

A full-featured, production-ready school and organization management platform built for **Ponts per la Pau** (Bridges for Peace).
Live at [pxpmanagement.es](https://pxpmanagement.es).

---

## Table of Contents

1. [Overview](#overview)
2. [Feature Modules](#feature-modules)
3. [Architecture](#architecture)
4. [Tech Stack](#tech-stack)
5. [Role-Based Access Control](#role-based-access-control)
6. [Database Schema](#database-schema)
7. [Project Structure](#project-structure)
8. [Getting Started](#getting-started)
9. [Environment Variables](#environment-variables)
10. [Edge Functions](#edge-functions)
11. [Internationalization](#internationalization)
12. [PWA Support](#pwa-support)
13. [Security Model](#security-model)

---

## Overview

PXP Management is a multi-branch school administration platform. It handles the full lifecycle of an educational organization — from student enrollment and class scheduling through library management, fee collection, grant tracking, staff messaging, and parent communication. Every piece of data is branch-scoped so admins only ever see their own branch; superadmins have a global view.

The frontend is a React SPA deployed on Vercel. The backend runs entirely on Supabase (PostgreSQL + Edge Functions). Authentication is a custom HMAC-SHA256 session-token scheme, not Supabase Auth.

---

## Feature Modules

### Core Administration

| Module | Route | Roles | Description |
|--------|-------|-------|-------------|
| **Dashboard** | `/` | All | Role-aware stats panel: headcounts, pending tasks, recent activity, quick-action cards. Superadmin sees a global summary; branch roles see only their branch. |
| **Staff Management** | `/staff` | Admin+ | Full CRUD for teachers, librarians, and admins. Employment type, department, supervisor hierarchy, branch assignment. Soft-delete preserves history. |
| **Student Management** | `/students` | Admin, Teacher | Enrollment with auto-generated student codes, parent/guardian contacts, emergency info, medical notes, documents tab. Bulk CSV import with flexible column mapping. |
| **Student Profile** | `/students/:id` | All | Detailed profile view with grades, attendance history, borrowings, fees, and document attachments. Generates enrollment and completion certificates (PDF). |
| **Classes** | `/classes` | Admin, Teacher | Class creation with capacity tracking, schedule days/times, teacher assignment. Status lifecycle: draft → active → inactive → archived. |
| **Timetable** | `/timetable` | Admin, Teacher, Student | Weekly grid view of all active classes for the current branch, color-coded by class. |
| **Calendar** | `/calendar` | Admin, Teacher, Student | Full monthly/weekly/daily/agenda calendar. Classes expand into recurring events based on their `scheduleDays`. Click any event for details. |
| **Attendance** | `/attendance` | Admin, Teacher | Daily attendance recording per class. Automatic cumulative percentage calculation per enrollment. |
| **Grades** | `/grades` | Admin, Teacher | Grade entries per enrollment and assessment type. Aggregate stats per student and class. |

### Finance & Donors

| Module | Route | Roles | Description |
|--------|-------|-------|-------------|
| **Fees** | `/fees` | Admin, Teacher | Student fee management: create fees with due dates, mark as paid (cash/card/bank/other), waive, delete. Summary cards: total outstanding, overdue count, collected this month. Overdue alert banner. |
| **Financial Reports** | `/reports` | Admin+ | Inter-branch financial transactions with sender/receiver tracking and approval workflow. |
| **Donor & Grant Tracking** | `/donors` | Admin+ | Donor registry (individual, organisation, government, foundation). Per-donor grant list with budget vs. spend progress bars. Income/expense transactions per grant. Full CRUD at all three levels. |

### Library

| Module | Route | Roles | Description |
|--------|-------|-------|-------------|
| **Library** | `/library` | Admin, Librarian | Book catalog with individual copy tracking. Borrow, return, renew. Overdue detection and notifications. |

### Communication

| Module | Route | Roles | Description |
|--------|-------|-------|-------------|
| **Messages** | `/messages` | Admin, Teacher, Librarian | In-app staff messaging. Inbox / Sent tabs with unread count badge. Compose to an individual or broadcast to all staff. Threaded replies. |
| **Surveys** | `/surveys` | Admin+ | Survey builder with multiple question types. Response collection and per-question analytics. |

### Parent Portal

| Module | Route | Roles | Description |
|--------|-------|-------|-------------|
| **Parent Dashboard** | `/parent-portal` | Parent | Read-only portal. Overview tab shows each child's average grade, attendance %, and pending fee count. Fees tab lists all outstanding fees per child. |
| **Parent Links** | `/parent-links` | Admin+ | Admin UI to create and manage parent↔student relationships. Relationship types: mother, father, guardian, other. |

### Administration & Settings

| Module | Route | Roles | Description |
|--------|-------|-------|-------------|
| **Branches** | `/branches` | Superadmin | Create and manage branches. Assign admins. |
| **Settings** | `/settings` | Admin+ | General settings (org name, logo, academic year), notification settings, security settings, and system-level settings (superadmin only). |
| **Password Resets** | `/password-resets` | Admin+ | Admin-mediated reset queue. Users request a reset; admins approve and set new credentials. |
| **Profile** | `/profile` | All | Personal info, position, bio. Self-service password change. |

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                        Frontend                           │
│   React 19 · TypeScript · Vite 7 · Tailwind · shadcn/ui  │
│   PWA (vite-plugin-pwa + Workbox service worker)          │
└───────────────────────┬──────────────────────────────────┘
                        │  HTTPS + HMAC-SHA256 session tokens
┌───────────────────────▼──────────────────────────────────┐
│             Supabase Edge Functions (Deno runtime)        │
│  login · create-user · update-user · user-documents       │
│  request-password-reset · resolve-password-reset          │
└───────────────────────┬──────────────────────────────────┘
                        │  Service-role key (server-side only)
┌───────────────────────▼──────────────────────────────────┐
│                  Supabase PostgreSQL                       │
│  20+ tables · RLS · pgcrypto · triggers · indexes         │
└──────────────────────────────────────────────────────────┘
```

### Authentication Flow

The system uses a custom **HMAC-SHA256 session token** scheme — not Supabase Auth.

1. User submits email + password to the `/login` edge function.
2. The edge function calls `verify_password()` (bcrypt via pgcrypto) in PostgreSQL.
3. On success, the function mints an HMAC-signed session token and returns it.
4. The frontend stores the token in `localStorage` and sends it as the `X-Session-Token` header on all subsequent edge function calls.
5. Each edge function verifies the token signature and expiry before processing.

Rate limiting is enforced via the `login_attempts` table (max attempts + lockout window).

### Data Isolation (Branch Scoping)

`src/lib/scope.ts` exports `scopedBranchId()` which reads the current user's `branchId` from the session. Every service function that should be branch-scoped calls this and appends a `.eq('branch_id', branchId)` filter when the value is non-null. Superadmins get `null` back, so they see all branches.

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| UI Framework | React | 19.2 |
| Language | TypeScript | 5.9 |
| Build Tool | Vite | 7.2 |
| Styling | Tailwind CSS | 3.4 |
| Component Library | shadcn/ui (Radix UI primitives) | latest |
| Routing | React Router | 7 |
| Forms | React Hook Form + Zod | 7 / 4 |
| i18n | react-i18next | 16 |
| Charts | Recharts | 2.15 |
| Calendar | react-big-calendar + date-fns | 1.19 / 4.1 |
| PDF Generation | jsPDF + jspdf-autotable | 4.2 / 5.0 |
| CSV Parsing | Papa Parse | 5.5 |
| Spreadsheet Export | xlsx | 0.18 |
| Notifications | Sonner (toast) | 2.0 |
| PWA | vite-plugin-pwa + Workbox | 1.3 |
| Backend | Supabase Edge Functions (Deno) | — |
| Database | Supabase PostgreSQL + RLS | — |
| Storage | Supabase Storage (private bucket) | — |
| Auth | Custom HMAC-SHA256 session tokens | — |
| Hosting | Vercel | — |

---

## Role-Based Access Control

Six roles exist in the system. Route-level guards are enforced by `ProtectedRoute` in `App.tsx`; service-level guards are enforced by `hasPermission()` checks inside components.

| Role | Scope | Capabilities |
|------|-------|-------------|
| **superadmin** | Global | Unrestricted. Manages all branches, all users, system settings, document access, org-wide reports. |
| **admin** | Branch-scoped | Manages staff, students, classes, fees, donors, parent links, and password resets within their own branch. |
| **teacher** | Branch-scoped | Views and manages classes they are assigned to. Records attendance and grades. Views students. |
| **librarian** | Branch-scoped | Full library operations: catalog, copies, borrowings. Read-only on other modules. |
| **student** | Self only | Views own profile, classes, grades, borrowed books, and fee status. Cannot see other users' data. |
| **parent** | Own children only | Parent portal: read-only view of linked children's academic summary and fee status. |

> Branch scoping is enforced at the **service layer** (Supabase `.eq('branch_id', branchId)` filters) and at the **edge function layer** (server-side token verification). Client-side role checks are a UX convenience only — they are not the security boundary.

---

## Database Schema

### Tables

| Table | Description |
|-------|-------------|
| `users` | Core user records. Email, hashed password, role, branch_id, status, profile fields. |
| `staff` | Extended profile for staff roles: position, department, supervisor, employment type, date joined, bio. |
| `students` | Extended profile for students: student code, date of birth, guardian contacts, emergency info, medical notes. |
| `branches` | Multi-location support. Each branch has a name, address, and admin assignment. |
| `classes` | Class records with schedule days/times, capacity, teacher, location, status. |
| `class_enrollments` | Many-to-many between students and classes. Tracks enrollment date and status. |
| `attendance` | Daily attendance records per enrollment. Present/absent/late/excused. |
| `grade_entries` | Grade records per enrollment and assessment type (quiz, exam, assignment, etc.). |
| `books` | Library catalog: title, author, ISBN, subject, cover URL. |
| `book_copies` | Individual physical copies with condition and availability status. |
| `book_borrowings` | Borrowing records with due dates, return dates, and overdue flags. |
| `transactions` | Inter-branch financial transfers with sender, receiver, amount, status. |
| `fees` | Student fee records: amount, currency, due date, status (pending/partial/paid/waived/overdue), payment method. |
| `donors` | Donor registry with type, contact info, and notes. |
| `grants` | Grants linked to donors and branches: amount, currency, dates, status. |
| `grant_transactions` | Income/expense transactions against a grant budget. |
| `messages` | In-app staff messages: sender, recipient (null = broadcast), subject, body, read_at, parent_id (threading). |
| `parent_student_links` | Parent↔student associations with relationship type. |
| `surveys` | Survey definitions with title, description, and target audience. |
| `survey_questions` | Questions belonging to a survey with type and order. |
| `survey_responses` | Individual response submissions. |
| `password_reset_requests` | Pending/resolved/rejected reset requests with rate limiting. |
| `user_documents` | Private document metadata (path, type, uploaded_by). Actual files in Supabase Storage. |
| `activity_logs` | Full audit trail of user actions with actor, action, table, and record ID. |
| `organization_settings` | Key-value runtime configuration per branch (org name, logo, academic year, etc.). |
| `login_attempts` | IP-based rate limiting for the login edge function. |

### Enums

| Enum | Values |
|------|--------|
| `user_role` | `superadmin`, `admin`, `teacher`, `librarian`, `student`, `parent` |
| `fee_status` | `pending`, `partial`, `paid`, `waived`, `overdue` |
| `fee_payment_method` | `cash`, `card`, `bank_transfer`, `other` |
| `grant_status` | `pending`, `active`, `closed`, `cancelled` |
| `grant_tx_type` | `income`, `expense` |

### Security

- Row Level Security (RLS) enabled on every table
- 60+ RLS policies (anon key policies for the SPA, service-role used only in edge functions)
- Passwords hashed with bcrypt via `pgcrypto`
- HMAC-SHA256 session tokens (not JWTs)
- Login rate limiting via `login_attempts`
- Branch-scoped data isolation at query level
- Private Supabase Storage bucket for sensitive documents (access via signed URLs from edge functions only)

---

## Project Structure

```
pontsperlapau/
├── public/
│   ├── image.png                  # App icon (PWA + favicon)
│   └── favicon.ico
├── src/
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Header.tsx          # Top bar: org name, notifications bell, user menu
│   │   │   ├── Sidebar.tsx         # Role-aware nav links with active state
│   │   │   └── MainLayout.tsx      # Shell: sidebar + header + outlet
│   │   ├── ui/                     # shadcn/ui primitives (40+ components)
│   │   ├── ui-custom/              # DataTable, StatCard, StatusBadge, AvatarWithFallback
│   │   └── DocumentsManager.tsx    # File upload/download with deferred (read-only) mode
│   ├── contexts/
│   │   ├── AuthContext.tsx          # Session storage, login/logout, hasPermission(), UserRole type
│   │   └── ThemeContext.tsx         # System-aware dark/light theme provider
│   ├── hooks/
│   │   ├── use-mobile.ts            # Responsive breakpoint hook
│   │   └── use-toast.ts             # Sonner wrapper
│   ├── i18n/
│   │   ├── index.ts                 # i18next init with language detector
│   │   └── locales/
│   │       ├── en.json              # English (default)
│   │       ├── es.json              # Spanish
│   │       ├── ca.json              # Catalan
│   │       └── fa.json              # Farsi (RTL)
│   ├── lib/
│   │   ├── edge.ts                  # Edge function caller — injects X-Session-Token, auto-logout on 401
│   │   ├── scope.ts                 # scopedBranchId() — reads branch from session
│   │   ├── supabase.ts              # Supabase JS client init
│   │   └── utils.ts                 # cn() Tailwind merge utility
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── Staff.tsx
│   │   ├── Students.tsx             # Includes CSV bulk import dialog
│   │   ├── StudentProfile.tsx       # Detail view + certificate PDF export
│   │   ├── Classes.tsx
│   │   ├── Timetable.tsx
│   │   ├── CalendarView.tsx         # react-big-calendar with class expansion
│   │   ├── Attendance.tsx
│   │   ├── Grades.tsx
│   │   ├── Fees.tsx
│   │   ├── Library.tsx
│   │   ├── Donors.tsx               # Donor → Grant → Transaction hierarchy
│   │   ├── Messages.tsx             # Inbox/Sent + threaded compose
│   │   ├── Surveys.tsx
│   │   ├── ParentDashboard.tsx      # Parent-only portal
│   │   ├── ParentLinks.tsx          # Admin: manage parent↔student links
│   │   ├── Branches.tsx
│   │   ├── PasswordResets.tsx
│   │   ├── Profile.tsx
│   │   ├── Login.tsx
│   │   ├── reports/
│   │   │   ├── NewTransactionDialog.tsx
│   │   │   └── TransactionDetailDialog.tsx
│   │   └── settings/
│   │       ├── GeneralSettings.tsx
│   │       ├── NotificationSettings.tsx
│   │       ├── SecuritySettings.tsx
│   │       └── SystemSettings.tsx
│   ├── services/                    # All Supabase data access lives here
│   │   ├── activityService.ts       # Audit log reads
│   │   ├── attendanceService.ts     # Daily attendance CRUD + percentage calc
│   │   ├── branchService.ts         # Branch CRUD + summary stats
│   │   ├── classService.ts          # Class CRUD + enrollment management
│   │   ├── dashboardService.ts      # Aggregated stats for dashboard cards
│   │   ├── documentsService.ts      # Signed URL generation, document metadata
│   │   ├── donorService.ts          # Donors, grants, grant transactions
│   │   ├── exportService.ts         # jsPDF exports: tables + certificates
│   │   ├── feeService.ts            # Student fees: CRUD, mark paid, summary
│   │   ├── gradesService.ts         # Grade entries CRUD + averages
│   │   ├── libraryService.ts        # Books, copies, borrowings, overdue detection
│   │   ├── messageService.ts        # In-app messages: inbox, sent, threads, unread count
│   │   ├── notificationsService.ts  # Bell aggregator: resets, transactions, overdue books
│   │   ├── parentService.ts         # Parent↔student links, children summary for portal
│   │   ├── passwordResetService.ts  # Reset request CRUD
│   │   ├── settingsService.ts       # Org settings read/write
│   │   ├── staffService.ts          # Staff CRUD with user join
│   │   ├── studentService.ts        # Student CRUD with user join + CSV helpers
│   │   ├── surveyService.ts         # Survey + question + response CRUD
│   │   └── transactionService.ts    # Financial transaction CRUD
│   ├── types/
│   │   └── index.ts                 # Shared TypeScript interfaces
│   ├── App.tsx                      # Router, ProtectedRoute, role-gated routes
│   └── main.tsx                     # React root + i18n init
├── supabase/
│   ├── functions/
│   │   ├── _shared/
│   │   │   ├── auth.ts              # HMAC token mint + verify
│   │   │   └── cors.ts              # CORS headers + error response helper
│   │   ├── login/                   # Verify credentials, return session token
│   │   ├── create-user/             # Create user + role-specific record (staff/student)
│   │   ├── update-user/             # Update user fields, change password, soft-delete
│   │   ├── user-documents/          # Signed upload/download URLs, delete document
│   │   ├── request-password-reset/  # Rate-limited public endpoint
│   │   └── resolve-password-reset/  # Admin-only approve/reject
│   └── migrations/                  # 38 SQL migrations applied in chronological order
├── vite.config.ts                   # Vite + PWA plugin + path aliases
├── tailwind.config.js
├── tsconfig.json
└── package.json
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- A Supabase project (with Edge Functions enabled)
- Supabase CLI v2+

### Installation

```bash
# Clone
git clone https://github.com/gmekhlas2001-ux/pontsperlapau.git
cd pontsperlapau

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env — fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY

# Start dev server
npm run dev
```

### Apply Database Migrations

```bash
supabase db push
```

All 38 migrations run in order, creating tables, enums, RLS policies, triggers, and seed data for organization settings.

### Deploy Edge Functions

```bash
supabase functions deploy login
supabase functions deploy create-user
supabase functions deploy update-user
supabase functions deploy user-documents
supabase functions deploy request-password-reset
supabase functions deploy resolve-password-reset
```

### Build for Production

```bash
npm run build
# Output in dist/ — deploy as a static site (Vercel, Netlify, etc.)
```

The build outputs a Vite PWA service worker (`dist/sw.js`) and manifest (`dist/manifest.webmanifest`) alongside the app bundle.

---

## Environment Variables

### Frontend (`.env`)

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL (e.g. `https://xxxx.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous/public key |

### Edge Function Secrets (`supabase secrets set KEY=value`)

| Secret | Description |
|--------|-------------|
| `SESSION_TOKEN_SECRET` | Random 32+ byte string used as the HMAC signing key for session tokens |
| `ALLOWED_ORIGINS` | Comma-separated list of allowed CORS origins (e.g. `https://pxpmanagement.es`) |

---

## Edge Functions

All sensitive or privileged operations go through Deno edge functions, which use the **service-role key** and are never exposed to the browser.

| Function | Method | Auth required | Description |
|----------|--------|---------------|-------------|
| `login` | POST | None | Verifies email/password, returns HMAC session token. Enforces rate limiting. |
| `create-user` | POST | Session token (admin+) | Creates a `users` row and the corresponding `staff` or `students` row in a single transaction. |
| `update-user` | POST | Session token (admin+) | Updates user fields. Handles password changes with bcrypt re-hashing. Soft-deletes by setting `deleted_at`. |
| `user-documents` | POST | Session token | Issues a signed upload URL (PUT), a signed download URL (GET), or deletes a document. Enforces superadmin-only access to certain document types. |
| `request-password-reset` | POST | None (rate-limited) | Creates a `password_reset_requests` record. Users can self-serve from the login screen. |
| `resolve-password-reset` | POST | Session token (admin+) | Approves (and sets new password) or rejects a pending reset request. |

---

## Internationalization

The app is fully translated into four languages:

| Code | Language | Notes |
|------|----------|-------|
| `en` | English | Default fallback |
| `es` | Spanish | — |
| `ca` | Catalan | — |
| `fa` | Farsi | RTL layout applied via `dir="rtl"` on `<html>` |

Language is auto-detected from the browser (`i18next-browser-languagedetector`) and can be switched from the user menu. All translation keys live under `src/i18n/locales/*.json`. Each module (fees, messages, donors, etc.) has its own top-level namespace key in those files.

---

## PWA Support

The app is a Progressive Web App and can be installed on mobile and desktop.

- **Service worker** auto-registers and updates via `vite-plugin-pwa` with `registerType: 'autoUpdate'`
- **Workbox** precaches all JS/CSS/HTML/images up to 4 MB
- **Runtime caching** for Supabase API calls: `NetworkFirst` strategy, 10-second network timeout, 5-minute cache TTL
- **Manifest** includes name, theme color (`#0d9488` teal), `standalone` display mode, and portrait orientation lock

To install: open the app in Chrome/Safari and use the "Add to Home Screen" / install prompt.

---

## Security Model

| Concern | Implementation |
|---------|----------------|
| **Authentication** | Custom HMAC-SHA256 session tokens — never stored server-side, verified by signature + expiry |
| **Password storage** | bcrypt via PostgreSQL `pgcrypto` extension |
| **Authorization** | Row Level Security on every table. Anon key only reads/writes what RLS allows. |
| **Privilege escalation** | Sensitive mutations (create user, change password, documents) require a valid session token verified server-side in edge functions |
| **Rate limiting** | `login_attempts` table tracks failed logins by IP. `password_reset_requests` limits by email. |
| **Branch isolation** | Every service query appends `branch_id = scopedBranchId()` filter. Superadmins bypass with null. |
| **File access** | Documents stored in a private Supabase Storage bucket. Access only via short-lived signed URLs issued by the `user-documents` edge function. |
| **CORS** | Edge functions validate `Origin` header against `ALLOWED_ORIGINS` secret before processing. |

---

## License

Proprietary — built for Ponts per la Pau.

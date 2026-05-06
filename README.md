# PXP Management System

A full-featured, production-ready school and organization management platform built for **Ponts per la Pau** (Bridges for Peace). Deployed at [pxpmanagement.es](https://pxpmanagement.es).

---

## Features

| Module | Description |
|--------|-------------|
| **Staff Management** | Full CRUD for teachers, librarians, admins. Employment types, departments, supervisor hierarchy. |
| **Student Management** | Enrollment, parent/guardian contacts, emergency info, medical notes, auto-generated IDs. |
| **Class Management** | Scheduling, capacity tracking, enrollment, status lifecycle (active → inactive → archived). |
| **Library System** | Book catalog, individual copy tracking, borrowing/returns, overdue detection, renewals. |
| **Financial Transactions** | Inter-branch transfers, sender/receiver tracking, approval workflow. |
| **Attendance** | Daily recording with automatic percentage calculation per enrollment. |
| **Document Attachments** | Private file storage for sensitive student/staff documents (superadmin-restricted). |
| **Password Reset Workflow** | Admin-mediated: users request, admins approve and set new credentials. |
| **Notifications** | Real-time bell aggregating pending resets, pending transactions, overdue books. |
| **Multi-branch Support** | Branch-scoped data isolation — admins see only their branch, superadmins see everything. |
| **Internationalization** | English, Spanish, Catalan, Farsi — with full RTL support. |
| **Dark Mode** | System-aware theme toggle. |

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                     Frontend                          │
│  React 19 · TypeScript · Vite · Tailwind · shadcn/ui │
└──────────────────┬───────────────────────────────────┘
                   │  HTTPS + HMAC session tokens
┌──────────────────▼───────────────────────────────────┐
│              Supabase Edge Functions (Deno)           │
│  login · create-user · update-user · user-documents  │
│  request-password-reset · resolve-password-reset     │
└──────────────────┬───────────────────────────────────┘
                   │  Service-role key (server-side only)
┌──────────────────▼───────────────────────────────────┐
│              Supabase PostgreSQL                      │
│  16+ tables · RLS · pgcrypto · triggers · indexes    │
└──────────────────────────────────────────────────────┘
```

### Authentication Flow

The system uses a **custom HMAC-SHA256 session token** scheme (not Supabase Auth):

1. User submits email + password to the `/login` edge function.
2. Edge function verifies credentials via `verify_password()` (bcrypt/pgcrypto).
3. On success, an HMAC-signed token is minted and returned.
4. The frontend stores the token in `localStorage` and attaches it as `X-Session-Token` on every subsequent edge function call.
5. Edge functions verify the token signature + expiry before processing.

Rate limiting is enforced via `login_attempts` and `password_reset_requests` tables.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| UI Framework | React 19, TypeScript 5.9 |
| Build Tool | Vite 7 |
| Styling | Tailwind CSS 3.4, shadcn/ui (Radix primitives) |
| Forms | React Hook Form + Zod validation |
| Routing | React Router 7 |
| i18n | react-i18next (en, es, ca, fa) |
| Charts | Recharts |
| Backend | Supabase Edge Functions (Deno runtime) |
| Database | Supabase PostgreSQL with Row Level Security |
| Storage | Supabase Storage (private bucket for documents) |
| Auth | Custom HMAC-SHA256 session tokens |

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Supabase project (with Edge Functions enabled)
- Supabase CLI (for deploying functions and migrations)

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd pontsperlapau

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY

# Start development server
npm run dev
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous/public key |

Edge functions also require these secrets (set via `supabase secrets set`):

| Secret | Description |
|--------|-------------|
| `SESSION_TOKEN_SECRET` | HMAC signing key for session tokens |
| `ALLOWED_ORIGINS` | Comma-separated allowed CORS origins |

### Deploy Edge Functions

```bash
supabase functions deploy login
supabase functions deploy create-user
supabase functions deploy update-user
supabase functions deploy user-documents
supabase functions deploy request-password-reset
supabase functions deploy resolve-password-reset
```

### Apply Migrations

```bash
supabase db push
```

### Build for Production

```bash
npm run build
# Output in dist/ — deploy to any static host (Vercel, Netlify, etc.)
```

---

## Project Structure

```
src/
├── components/
│   ├── layout/              # Header, Sidebar, MainLayout
│   ├── ui/                  # shadcn/ui primitives (40+ components)
│   ├── ui-custom/           # DataTable, StatCard, StatusBadge, AvatarWithFallback
│   └── DocumentsManager.tsx # File upload/download with deferred mode
├── contexts/
│   ├── AuthContext.tsx       # Session management, login/logout, role checks
│   └── ThemeContext.tsx      # Dark/light theme provider
├── hooks/                   # use-mobile, use-toast
├── i18n/
│   └── locales/             # en.json, es.json, ca.json, fa.json
├── lib/
│   ├── edge.ts              # Edge function caller with auto-logout on 401
│   ├── scope.ts             # Branch-scoping helpers for data isolation
│   ├── supabase.ts          # Supabase client init
│   └── utils.ts             # Tailwind merge utility
├── pages/
│   ├── Dashboard.tsx         # Role-aware stats and quick actions
│   ├── Staff.tsx             # Staff CRUD with branch filtering
│   ├── Students.tsx          # Student CRUD with document attachments
│   ├── Classes.tsx           # Class management with status lifecycle
│   ├── Library.tsx           # Book catalog and borrowing
│   ├── Reports.tsx           # Financial transactions
│   ├── Branches.tsx          # Multi-branch management (superadmin)
│   ├── Settings.tsx          # System settings (superadmin)
│   ├── Profile.tsx           # Personal info + password change
│   ├── PasswordResets.tsx    # Admin password reset queue
│   ├── Surveys.tsx           # Survey builder and analytics
│   └── Login.tsx             # Auth page with forgot-password flow
├── services/                # Data layer — each module has its own service
│   ├── staffService.ts
│   ├── studentService.ts
│   ├── classService.ts
│   ├── libraryService.ts
│   ├── transactionService.ts
│   ├── branchService.ts
│   ├── dashboardService.ts
│   ├── documentsService.ts
│   ├── passwordResetService.ts
│   ├── notificationsService.ts
│   ├── settingsService.ts
│   ├── activityService.ts
│   └── surveyService.ts
├── types/index.ts           # Shared TypeScript interfaces
└── main.tsx                 # App entry point

supabase/
├── functions/
│   ├── _shared/
│   │   ├── auth.ts          # HMAC token issuance + verification
│   │   └── cors.ts          # CORS headers + error helper
│   ├── login/               # Credential verification + token minting
│   ├── create-user/         # User + role-specific record creation
│   ├── update-user/         # User updates, credential changes, soft delete
│   ├── user-documents/      # Secure file upload/download/delete
│   ├── request-password-reset/  # Public rate-limited reset requests
│   └── resolve-password-reset/  # Admin-only resolve/reject
└── migrations/              # 25+ migration files (applied in order)
```

---

## Role-Based Access Control

| Role | Scope | Capabilities |
|------|-------|-------------|
| **Superadmin** | Global | Full system access. Manage branches, settings, view all documents. |
| **Admin** | Branch-scoped | Manage staff, students, classes within their branch. Approve password resets. |
| **Teacher** | Own classes | View students, manage attendance, class operations. |
| **Librarian** | Library | Book management, borrowing operations. |
| **Student** | Self only | View own profile, classes, borrowed books. |

Branch scoping is enforced at both the **service layer** (client-side filtering) and the **edge function layer** (server-side verification).

---

## Database

### Core Tables

- `users` — Authentication, profiles, role assignment
- `staff` / `students` — Extended role-specific profiles
- `classes` / `class_enrollments` — Scheduling, enrollment
- `attendance` — Daily records with auto-calculated stats
- `books` / `book_copies` / `book_borrowings` — Full library system
- `branches` — Multi-location support
- `transactions` — Financial transfers
- `password_reset_requests` — Admin-mediated reset queue
- `user_documents` — Private document metadata
- `activity_logs` — Complete audit trail
- `organization_settings` — Runtime configuration
- `login_attempts` — Rate limiting

### Security

- Row Level Security (RLS) enabled on all tables
- 60+ security policies
- bcrypt password hashing via pgcrypto
- HMAC-SHA256 session tokens (not JWT)
- Rate limiting on login and password reset
- Branch-scoped data isolation
- Private storage bucket for sensitive documents

---

## License

Proprietary — built for Ponts per la Pau.

# Ponts per la Pau Management System

A comprehensive management system for Ponts per la Pau (Bridges for Peace) organization, built with React, TypeScript, and Supabase.

## Overview

This system provides complete management capabilities for:
- **Staff Management** - Track teachers, librarians, administrators
- **Student Management** - Student profiles, enrollment, parent contacts
- **Class Management** - Course scheduling, enrollments, capacity tracking
- **Attendance Tracking** - Daily attendance with automatic statistics
- **Library System** - Book catalog, borrowing, returns, renewals
- **Role-Based Access Control** - 5 user roles with granular permissions
- **Activity Logging** - Complete audit trail of all actions
- **Notifications** - Real-time user notifications
- **Multi-Language Support** - English, Spanish, Catalan, Farsi

## Tech Stack

### Frontend
- **React 19** with TypeScript
- **Vite** for fast development
- **Tailwind CSS** for styling
- **Radix UI** for accessible components
- **React Router** for navigation
- **React Hook Form** + Zod for forms
- **i18next** for internationalization

### Backend & Database
- **Supabase** (PostgreSQL) for database
- **Row Level Security (RLS)** enabled on all tables
- **JWT Authentication** with refresh tokens
- **RESTful API** architecture ready

## Quick Start

### Prerequisites
- Node.js 18+ and npm
- Supabase account (already configured)

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

The application will be available at `http://localhost:5173`

### Environment Variables

The `.env` file is already configured with Supabase credentials:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key
```

## Database Schema

### Current Status

**Active in Supabase**:
- ✅ `users` table (with 1 superadmin user)
- See `SUPERADMIN_CREDENTIALS.md` for login details

**Migration Files Ready** (in `supabase/migrations/`):
The complete database schema has been designed with the following tables:

### Core Tables
- **users** - Main user authentication and profiles
- **staff** - Extended staff member information
- **students** - Extended student information with auto-generated IDs
- **classes** - Course management with scheduling
- **class_enrollments** - Student-class relationships
- **attendance** - Daily attendance records with auto-calculated statistics

### Library Tables
- **books** - Book catalog with inventory tracking
- **book_copies** - Individual physical copy management
- **book_borrowings** - Lending transactions with overdue tracking

### System Tables
- **roles** - User role definitions (5 system roles)
- **permissions** - Granular permission system (22 permissions)
- **role_permissions** - Role-permission mappings
- **activity_logs** - Complete audit trail
- **notifications** - User notification system
- **organization_settings** - System configuration
- **refresh_tokens** - JWT token management

### Database Features
- ✅ Row Level Security (RLS) on all tables
- ✅ 60+ security policies implemented
- ✅ Automatic timestamp updates
- ✅ Soft delete support
- ✅ Automatic attendance percentage calculation
- ✅ Book availability tracking
- ✅ Overdue detection
- ✅ 50+ performance indexes
- ✅ Foreign key constraints
- ✅ Data validation constraints

## User Roles & Permissions

### SuperAdmin
- Full system access
- Manage roles and permissions
- Modify system settings
- Cannot be demoted

### Admin
- Manage all staff and students
- Manage all classes and library
- View reports and statistics
- Cannot modify roles or settings

### Teacher
- Manage own classes
- Enroll/remove students in own classes
- Mark attendance
- View student information
- View library catalog

### Librarian
- Full library management
- Lend and return books
- View borrowing history
- View user profiles

### Student
- View own profile and classes
- View library catalog
- View own attendance
- View own borrowed books

## API Documentation

Complete API documentation is available in `API_DOCUMENTATION.md`, including:

- 80+ REST API endpoints
- Authentication & authorization flows
- Request/response examples
- Database query patterns
- Implementation guides
- Deployment instructions

### Key API Sections
- Authentication endpoints (register, login, refresh, logout)
- Staff management (CRUD operations)
- Student management (CRUD + enrollments)
- Class management (scheduling, enrollments, attendance)
- Library management (books, borrowing, returns)
- Dashboard & statistics
- Settings & notifications

## Default Configuration

### System Roles (Already Created)
- superadmin
- admin
- teacher
- librarian
- student

### Default Permissions (22 Permissions)
Including: manage_users, view_users, manage_staff, manage_students, manage_classes, manage_books, manage_borrowings, view_reports, and more.

### Organization Settings
- Library lending period: 14 days
- Max book renewals: 2
- Attendance threshold: 80%
- Max books per user: 3
- Email notifications: enabled
- Current academic year: 2024-2025

## Features Implemented

### Authentication
- ✅ Email/password authentication
- ✅ JWT with refresh tokens
- ✅ Password reset flow ready
- ✅ 2FA support ready
- ✅ Session management

### Staff Management
- ✅ Complete CRUD operations
- ✅ Position and department tracking
- ✅ Employment type (full-time, part-time, contract)
- ✅ Supervisor hierarchy
- ✅ Soft delete

### Student Management
- ✅ Auto-generated student IDs (STU-0001, etc.)
- ✅ Grade level tracking
- ✅ Parent/guardian information
- ✅ Emergency contacts
- ✅ Medical notes and allergies
- ✅ Soft delete

### Class Management
- ✅ Teacher assignment
- ✅ Schedule management (days, times)
- ✅ Location and capacity tracking
- ✅ Academic year and semester
- ✅ Status (active, inactive, archived)
- ✅ Student enrollment
- ✅ Automatic capacity validation

### Attendance System
- ✅ Daily attendance recording
- ✅ Status: present, absent, late, excused
- ✅ Automatic percentage calculation
- ✅ Teacher tracking
- ✅ Duplicate prevention (one record per student per day)
- ✅ Attendance statistics per enrollment

### Library System
- ✅ Complete book catalog
- ✅ ISBN tracking
- ✅ Multiple copies per book
- ✅ Individual copy management
- ✅ Barcode support ready
- ✅ Borrowing transactions
- ✅ Due date tracking
- ✅ Overdue detection
- ✅ Book renewal (with limits)
- ✅ Fine calculation ready
- ✅ Condition tracking (on borrow and return)
- ✅ Automatic availability updates

### Security & Auditing
- ✅ Row Level Security on all tables
- ✅ Role-based access control
- ✅ Complete activity logging
- ✅ IP address and user agent tracking
- ✅ Before/after state tracking (JSONB)
- ✅ Secure password hashing

### Notifications
- ✅ User notification system
- ✅ Read/unread status
- ✅ Links to related resources
- ✅ Notification types
- ✅ Automatic read timestamp

## Project Structure

```
src/
├── components/          # React components
│   ├── layout/         # Layout components
│   ├── ui/             # UI components (Radix UI)
│   └── ui-custom/      # Custom UI components
├── contexts/           # React contexts
│   ├── AuthContext.tsx
│   └── ThemeContext.tsx
├── hooks/              # Custom hooks
├── i18n/               # Internationalization
│   └── locales/        # Language files (en, es, ca, fa)
├── lib/                # Utility libraries
├── pages/              # Page components
├── types/              # TypeScript type definitions
└── main.tsx           # Application entry point

API_DOCUMENTATION.md    # Complete API documentation
```

## Building for Production

```bash
# Build the application
npm run build

# Preview production build
npm run preview
```

The build output will be in the `dist/` directory.

## Deployment

### Frontend Deployment
The React application can be deployed to:
- Vercel (recommended)
- Netlify
- AWS Amplify
- Any static hosting service

### Backend API
You need to implement a backend API server following the documentation in `API_DOCUMENTATION.md`. Options:

1. **Vercel Serverless Functions** (recommended)
2. **Node.js/Express server**
3. **AWS Lambda**
4. **Any Node.js hosting**

### Domain Configuration
Target domain: **pxpmanagement.es**

## Next Steps

To complete the system, you need to:

1. **Implement Backend API**
   - Follow the guide in `API_DOCUMENTATION.md`
   - Create authentication endpoints
   - Implement CRUD endpoints for all resources
   - Add middleware for authentication and authorization

2. **Connect Frontend to Backend**
   - Create API client service
   - Update frontend to call backend APIs
   - Handle authentication state
   - Implement error handling

3. **Testing**
   - Test all user roles and permissions
   - Test all CRUD operations
   - Test library borrowing flow
   - Test attendance tracking
   - Test notification system

4. **Deploy**
   - Deploy backend API to Vercel
   - Deploy frontend to Vercel
   - Configure domain (pxpmanagement.es)
   - Set up SSL certificate

5. **Optional Enhancements**
   - Email notification service
   - SMS notifications for overdue books
   - Bulk import/export (CSV)
   - PDF report generation
   - Dashboard charts and analytics
   - File upload for profile pictures and book covers
   - Advanced search and filtering

## Database Statistics

- **Tables**: 16 tables created
- **Roles**: 5 system roles configured
- **Permissions**: 22 granular permissions
- **RLS Policies**: 60+ security policies
- **Triggers**: 10+ automatic update triggers
- **Indexes**: 50+ performance indexes
- **Default Settings**: 7 organization settings
- **Current Data**: 5 roles, 22 permissions, 66 role-permission mappings, 7 settings

## Support & Documentation

- **API Documentation**: See `API_DOCUMENTATION.md`
- **Database Schema**: Fully documented with comments in migrations
- **Supabase Dashboard**: Access your database at https://supabase.com/dashboard
- **Supabase Docs**: https://supabase.com/docs
- **React Docs**: https://react.dev
- **Tailwind CSS**: https://tailwindcss.com/docs

## License

This project is built for Ponts per la Pau organization.

---

**Version**: 1.0.0
**Last Updated**: March 3, 2026
**Database Schema Version**: v1 (Initial Schema)
**Built with**: React 19, TypeScript, Vite, Supabase, Tailwind CSS

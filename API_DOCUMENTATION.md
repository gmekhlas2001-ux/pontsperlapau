# Ponts per la Pau Management System - API Documentation

## Table of Contents
1. [Overview](#overview)
2. [Database Schema](#database-schema)
3. [Authentication](#authentication)
4. [API Endpoints](#api-endpoints)
5. [Implementation Guide](#implementation-guide)

---

## Overview

This document provides comprehensive documentation for the Ponts per la Pau Management System backend. The system is built using:

- **Database**: Supabase (PostgreSQL)
- **Authentication**: JWT-based authentication
- **Architecture**: RESTful API
- **Row Level Security**: Enabled on all tables
- **Domain**: pxpmanagement.es

### Key Features
- User management (staff, students)
- Class management and enrollments
- Attendance tracking
- Library management (books, borrowing system)
- Role-based access control (RBAC)
- Activity logging and audit trails
- Notification system
- Multi-language support (4 languages)

---

## Database Schema

### Core Tables Created

#### 1. **users**
Main authentication and user profile table.
- Stores all users (staff, students)
- Supports roles: superadmin, admin, teacher, librarian, student
- Email/password authentication
- Profile information (name, phone, DOB, gender, photo)
- Status tracking (active/inactive)
- 2FA support ready

#### 2. **staff**
Extended profile for staff members.
- Links to users table (one-to-one)
- Position, department, employee ID
- Employment type (full_time, part_time, contract)
- Supervisor hierarchy support
- Soft delete capability

#### 3. **students**
Extended profile for students.
- Links to users table (one-to-one)
- Auto-generated student IDs (STU-0001, STU-0002, etc.)
- Grade level, enrollment date
- Parent/guardian contact information
- Emergency contact details
- Medical notes and allergies
- Soft delete capability

#### 4. **classes**
Course/class management.
- Teacher assignment
- Schedule (days, times)
- Location and capacity
- Academic year and semester
- Status (active, inactive, archived)

#### 5. **class_enrollments**
Student-class junction table.
- Links students to classes
- Tracks enrollment status (active, dropped, completed)
- Automatic attendance percentage calculation
- Grade storage

#### 6. **attendance**
Daily attendance tracking.
- Records per student per class per date
- Status: present, absent, late, excused
- Automatically updates enrollment attendance statistics
- Teacher tracking

#### 7. **books**
Library book catalog.
- Book information (title, author, ISBN, publisher)
- Category, language, description
- Total and available copies tracking
- Physical condition tracking
- Acquisition details

#### 8. **book_copies**
Individual physical copy tracking.
- Automatically created for each book
- Barcode support
- Individual status (available, borrowed, damaged, lost, maintenance)
- Condition tracking

#### 9. **book_borrowings**
Book lending transactions.
- Borrower tracking
- Due dates and return dates
- Overdue status calculation
- Fine amount tracking
- Renewal support (with limits)
- Condition on return

#### 10. **roles**
System roles definition.
- Pre-defined roles: superadmin, admin, teacher, librarian, student
- System roles cannot be deleted
- Custom role support

#### 11. **permissions**
Granular permissions.
- Resource-action based (e.g., manage_users, view_books)
- 22 default permissions created
- Organized by resource and action

#### 12. **role_permissions**
Role-permission junction.
- Links roles to specific permissions
- Default permissions assigned to each role

#### 13. **activity_logs**
Complete audit trail.
- Tracks all user actions
- Before/after state (JSONB)
- IP address and user agent tracking
- Action type and description

#### 14. **notifications**
User notification system.
- Per-user notifications
- Read/unread status
- Links to related resources
- Action URLs

#### 15. **organization_settings**
System configuration.
- Key-value pairs
- Type support (integer, boolean, string, json)
- Default settings for library lending, attendance thresholds, etc.

#### 16. **refresh_tokens**
JWT refresh token management.
- Secure token rotation
- Expiry tracking
- Revocation support

---

## Authentication

### Authentication Flow

#### 1. Registration
```typescript
POST /api/auth/register
Body: {
  email: string,
  password: string,
  first_name: string,
  last_name: string,
  role: 'admin' | 'teacher' | 'librarian' | 'student',
  phone_number?: string,
  date_of_birth?: date
}

Response: {
  user: User,
  access_token: string,
  refresh_token: string
}
```

#### 2. Login
```typescript
POST /api/auth/login
Body: {
  email: string,
  password: string
}

Response: {
  user: User,
  access_token: string (15 min expiry),
  refresh_token: string (7 day expiry)
}
```

#### 3. Refresh Token
```typescript
POST /api/auth/refresh-token
Body: {
  refresh_token: string
}

Response: {
  access_token: string,
  refresh_token: string
}
```

#### 4. Logout
```typescript
POST /api/auth/logout
Headers: {
  Authorization: "Bearer {access_token}"
}

Response: {
  message: "Logged out successfully"
}
```

### Authorization Header
All authenticated requests must include:
```
Authorization: Bearer {access_token}
```

### Role-Based Permissions

#### SuperAdmin
- Full system access
- Manage roles and permissions
- Modify system settings
- View all activity logs
- Manage all users, classes, and library

#### Admin
- Manage staff and students
- Manage classes and enrollments
- Manage library
- View reports and statistics
- Cannot modify roles or system settings

#### Teacher
- View staff profiles
- Manage students (create, update)
- Create and manage own classes
- Enroll/remove students in own classes
- Mark attendance in own classes
- View library (read-only)

#### Librarian
- View users, staff, students
- Manage library books (full CRUD)
- Manage borrowing transactions
- View borrowing history and reports

#### Student
- View own profile
- View enrolled classes
- View class details
- View library catalog
- View own borrowing history
- View own attendance

---

## API Endpoints

### Authentication Endpoints

#### Register
```
POST /api/auth/register
Creates a new user account
```

#### Login
```
POST /api/auth/login
Authenticates user and returns JWT tokens
```

#### Refresh Token
```
POST /api/auth/refresh-token
Generates new access token from refresh token
```

#### Logout
```
POST /api/auth/logout
Invalidates user session
```

#### Forgot Password
```
POST /api/auth/forgot-password
Sends password reset email
```

#### Reset Password
```
POST /api/auth/reset-password
Resets password using token
```

#### Get Current User
```
GET /api/auth/me
Returns current authenticated user information
```

### Staff Management Endpoints

#### List Staff
```
GET /api/staff
Query params: page, limit, role, status, search, sort_by
Returns paginated staff list
```

#### Get Staff Details
```
GET /api/staff/:id
Returns detailed staff information
```

#### Create Staff
```
POST /api/staff
Admin/SuperAdmin only
Creates new staff member
```

#### Update Staff
```
PUT /api/staff/:id
Admin+ or self
Updates staff information
```

#### Delete Staff
```
DELETE /api/staff/:id
Admin+ only
Soft deletes staff member
```

#### Toggle Staff Status
```
PATCH /api/staff/:id/status
Activates/deactivates staff account
```

#### Change Staff Role
```
PATCH /api/staff/:id/role
SuperAdmin only
Changes staff role
```

#### Get Staff Activity Log
```
GET /api/staff/:id/activity-log
Returns activity history for staff member
```

#### Get Staff by Role
```
GET /api/staff/by-role/:role
Filters staff by specific role
```

### Student Management Endpoints

#### List Students
```
GET /api/students
Query params: page, limit, status, class_id, search, sort_by
Returns paginated student list
```

#### Get Student Details
```
GET /api/students/:id
Returns detailed student information
```

#### Create Student
```
POST /api/students
Admin/Teacher only
Creates new student
```

#### Update Student
```
PUT /api/students/:id
Admin/Teacher+ or self
Updates student information
```

#### Delete Student
```
DELETE /api/students/:id
Admin only
Soft deletes student
```

#### Toggle Student Status
```
PATCH /api/students/:id/status
Activates/deactivates student account
```

#### Get Student Classes
```
GET /api/students/:id/classes
Returns all classes for a student
```

#### Get Student Attendance
```
GET /api/students/:id/attendance
Query params: class_id, month
Returns attendance records with percentage
```

#### Get Students by Class
```
GET /api/students/by-class/:class_id
Returns all students in a class
```

### Class Management Endpoints

#### List Classes
```
GET /api/classes
Query params: page, limit, status, teacher_id, search, sort_by, academic_year, semester
Returns paginated classes list
```

#### Get Class Details
```
GET /api/classes/:id
Returns class details with enrollment count
```

#### Create Class
```
POST /api/classes
Teacher/Admin+
Creates new class
```

#### Update Class
```
PUT /api/classes/:id
Class teacher or Admin+
Updates class information
```

#### Delete Class
```
DELETE /api/classes/:id
Admin+ only
Archives class
```

#### Change Class Status
```
PATCH /api/classes/:id/status
Changes class status (active/inactive/archived)
```

#### Enroll Student
```
POST /api/classes/:id/enroll-student
Teacher/Admin+
Adds student to class
```

#### Remove Student
```
DELETE /api/classes/:id/student/:student_id
Teacher/Admin+
Removes student from class
```

#### Get Enrolled Students
```
GET /api/classes/:id/enrolled-students
Query params: page, limit, sort_by
Returns enrolled students list
```

#### Mark Attendance
```
POST /api/classes/:id/mark-attendance
Teacher only
Records attendance for class session
Body: { student_id: status } pairs, date
```

#### Get Class Attendance
```
GET /api/classes/:id/attendance
Query params: month, date_from, date_to
Returns attendance records by student
```

#### Get Classes by Teacher
```
GET /api/classes/by-teacher/:teacher_id
Returns all classes for a teacher
```

### Library Management Endpoints

#### List Books
```
GET /api/library/books
Query params: page, limit, category, status, search, sort_by, available_only
Returns paginated book catalog
```

#### Get Book Details
```
GET /api/library/books/:id
Returns book details with borrowing history
```

#### Add Book
```
POST /api/library/books
Librarian/Admin+
Adds new book to catalog
```

#### Update Book
```
PUT /api/library/books/:id
Librarian/Admin+
Updates book information
```

#### Delete Book
```
DELETE /api/library/books/:id
Librarian/Admin+
Archives book
```

#### Change Book Status
```
PATCH /api/library/books/:id/status
Updates book availability status
```

#### Get Book Copies
```
GET /api/library/books/:id/copies
Returns all physical copies of a book
```

#### Get Book Borrowing History
```
GET /api/library/books/:id/borrowing-history
Returns complete borrowing history
```

#### Borrow Book
```
POST /api/library/borrow
Librarian only
Lends book to user
Body: { book_id, book_copy_id, borrower_id, due_date }
```

#### Return Book
```
POST /api/library/return
Librarian only
Processes book return
Body: { borrowing_id, condition_on_return }
```

#### Renew Book
```
POST /api/library/renew
Librarian or borrower
Renews book loan
Body: { borrowing_id, new_due_date }
```

#### Get Borrowed Books
```
GET /api/library/borrowed
Query params: page, limit, borrower_id, overdue_only, sort_by
Returns currently borrowed books
```

#### Get Overdue Books
```
GET /api/library/overdue
Query params: page, limit
Returns overdue borrowings
```

#### Get Library Statistics
```
GET /api/library/statistics
Librarian/Admin+
Returns library stats (total, available, borrowed, overdue, popular books)
```

#### Get User's Borrowed Books
```
GET /api/library/user/:user_id/borrowed
Returns books currently borrowed by user
```

#### Get User's Borrowing History
```
GET /api/library/user/:user_id/history
Returns complete borrowing history for user
```

### Dashboard Endpoints

#### Get Dashboard Summary
```
GET /api/dashboard/summary
Returns overview statistics:
- Total active/inactive staff
- Total active/inactive students
- Total classes
- Library books available/borrowed
- Overdue books count
```

#### Get Activity Feed
```
GET /api/dashboard/activity-feed
Query params: page, limit, days
Returns recent system activities
```

#### Get Statistics
```
GET /api/dashboard/statistics
Returns chart data:
- Staff by role
- Student enrollment trends
- Library status
- Class capacity utilization
```

#### Get Top Staff
```
GET /api/dashboard/top-staff
Returns most active staff members
```

#### Get Recent Enrollments
```
GET /api/dashboard/recent-enrollments
Returns recent student enrollments
```

#### Get Library Alerts
```
GET /api/dashboard/library-alerts
Returns alerts (overdue books, low stock, etc.)
```

### Settings & Admin Endpoints

#### Get Settings
```
GET /api/settings
Returns organization settings
```

#### Update Settings
```
PUT /api/settings
Admin+ only
Updates system settings
```

#### Get Permissions
```
GET /api/permissions
Admin+ only
Returns all available permissions
```

#### Get Roles
```
GET /api/roles
Admin+ only
Returns all roles with permissions
```

#### Create Role
```
POST /api/roles
SuperAdmin only
Creates custom role
Body: { name, description, permissions[] }
```

#### Update Role
```
PUT /api/roles/:id
SuperAdmin only
Updates role
```

#### Delete Role
```
DELETE /api/roles/:id
SuperAdmin only
Deletes custom role (cannot delete system roles)
```

#### Update Role Permissions
```
PUT /api/roles/:id/permissions
SuperAdmin only
Updates permissions for a role
```

#### Get Activity Logs
```
GET /api/activity-logs
Admin/SuperAdmin only
Query params: page, limit, user_id, action_type, date_from, date_to, search
Returns audit trail
```

#### Get User Notifications
```
GET /api/notifications/:user_id
Query params: page, limit, is_read
Returns user notifications
```

#### Mark Notification as Read
```
PATCH /api/notifications/:notification_id/read
Marks single notification as read
```

#### Mark All Notifications as Read
```
PATCH /api/notifications/read-all
Marks all user notifications as read
```

---

## Implementation Guide

### Step 1: Set Up Backend Server

Create a Node.js/Express server or use Vercel serverless functions.

#### Install Dependencies
```bash
npm install express @supabase/supabase-js bcryptjs jsonwebtoken zod
npm install -D typescript @types/node @types/express
```

#### Environment Variables (.env)
```env
# Supabase (already configured)
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key

# JWT
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRY=15m
REFRESH_TOKEN_EXPIRY=7d

# Server
PORT=3001
NODE_ENV=production
FRONTEND_URL=https://pxpmanagement.es
```

### Step 2: Create Supabase Client

```typescript
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey);
```

### Step 3: Implement Authentication Service

```typescript
// src/services/authService.ts
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { supabase } from '../lib/supabase';

export async function register(data: RegisterData) {
  const hashedPassword = await bcrypt.hash(data.password, 10);

  const { data: user, error } = await supabase
    .from('users')
    .insert({
      email: data.email,
      password_hash: hashedPassword,
      first_name: data.first_name,
      last_name: data.last_name,
      role: data.role,
      status: 'active'
    })
    .select()
    .single();

  if (error) throw error;

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  await saveRefreshToken(user.id, refreshToken);

  return { user, accessToken, refreshToken };
}

export async function login(email: string, password: string) {
  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .maybeSingle();

  if (error || !user) throw new Error('Invalid credentials');

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) throw new Error('Invalid credentials');

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  await saveRefreshToken(user.id, refreshToken);
  await updateLastLogin(user.id);

  return { user, accessToken, refreshToken };
}

function generateAccessToken(user: any) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET!,
    { expiresIn: process.env.JWT_EXPIRY }
  );
}

function generateRefreshToken(user: any) {
  return jwt.sign(
    { sub: user.id },
    process.env.JWT_SECRET!,
    { expiresIn: process.env.REFRESH_TOKEN_EXPIRY }
  );
}
```

### Step 4: Implement Authentication Middleware

```typescript
// src/middleware/auth.ts
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

export interface AuthRequest extends Request {
  user?: any;
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'unauthorized', message: 'Missing or invalid token' });
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'unauthorized', message: 'Invalid or expired token' });
  }
}

export function authorize(roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'forbidden', message: 'Insufficient permissions' });
    }

    next();
  };
}
```

### Step 5: Create Example Route

```typescript
// src/routes/staffRoutes.ts
import express from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { supabase } from '../lib/supabase';

const router = express.Router();

// Get all staff
router.get('/', authenticate, async (req, res) => {
  const { page = 1, limit = 10, role, status, search } = req.query;

  let query = supabase
    .from('staff')
    .select('*, users(*)', { count: 'exact' })
    .is('deleted_at', null);

  if (role) query = query.eq('users.role', role);
  if (status) query = query.eq('users.status', status);
  if (search) {
    query = query.or(`users.first_name.ilike.%${search}%,users.last_name.ilike.%${search}%`);
  }

  const from = (Number(page) - 1) * Number(limit);
  const to = from + Number(limit) - 1;

  const { data, error, count } = await query.range(from, to);

  if (error) {
    return res.status(500).json({ error: 'server_error', message: error.message });
  }

  res.json({
    data,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total: count || 0,
      totalPages: Math.ceil((count || 0) / Number(limit))
    }
  });
});

// Create staff (Admin+ only)
router.post('/', authenticate, authorize(['admin', 'superadmin']), async (req, res) => {
  // Implementation here
});

export default router;
```

### Step 6: Database Queries

All tables have Row Level Security (RLS) enabled. Your Supabase client automatically enforces these policies based on the authenticated user.

#### Query Examples

```typescript
// Get staff members (RLS automatically filters based on user role)
const { data, error } = await supabase
  .from('staff')
  .select('*, users(*)')
  .is('deleted_at', null);

// Get student with classes
const { data, error } = await supabase
  .from('students')
  .select(`
    *,
    users(*),
    class_enrollments(
      *,
      classes(*)
    )
  `)
  .eq('id', studentId)
  .maybeSingle();

// Get class with teacher and students
const { data, error } = await supabase
  .from('classes')
  .select(`
    *,
    staff!teacher_id(*,users(*)),
    class_enrollments(
      *,
      students(*,users(*))
    )
  `)
  .eq('id', classId)
  .maybeSingle();

// Get available books
const { data, error } = await supabase
  .from('books')
  .select('*')
  .gt('available_copies', 0)
  .is('deleted_at', null);

// Get user's borrowed books
const { data, error } = await supabase
  .from('book_borrowings')
  .select(`
    *,
    books(*),
    book_copies(*)
  `)
  .eq('borrower_id', userId)
  .is('returned_date', null);
```

### Step 7: Activity Logging

```typescript
// src/utils/activityLogger.ts
import { supabase } from '../lib/supabase';

export async function logActivity(
  userId: string,
  actionType: string,
  tableName: string,
  recordId: string,
  description: string,
  oldValues?: any,
  newValues?: any,
  ipAddress?: string,
  userAgent?: string
) {
  await supabase.from('activity_logs').insert({
    user_id: userId,
    action_type: actionType,
    table_name: tableName,
    record_id: recordId,
    description,
    old_values: oldValues,
    new_values: newValues,
    ip_address: ipAddress,
    user_agent: userAgent
  });
}

// Usage in routes
await logActivity(
  req.user.sub,
  'create',
  'staff',
  newStaff.id,
  `Created staff member: ${newStaff.users.first_name} ${newStaff.users.last_name}`,
  null,
  newStaff,
  req.ip,
  req.headers['user-agent']
);
```

### Step 8: Deploy to Vercel

#### vercel.json
```json
{
  "version": 2,
  "builds": [
    {
      "src": "api/**/*.ts",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "/api/$1"
    }
  ]
}
```

---

## Next Steps

1. ✅ Database schema created with all tables
2. ✅ Row Level Security policies implemented
3. ✅ Default roles and permissions configured
4. ✅ Organization settings initialized

### To Complete:
1. Implement backend API routes as described above
2. Create authentication service and middleware
3. Build frontend API client to call these endpoints
4. Test all endpoints with different user roles
5. Deploy backend to Vercel
6. Configure domain (pxpmanagement.es)

---

## Database Statistics

- **Tables Created**: 16
- **Roles Configured**: 5 (superadmin, admin, teacher, librarian, student)
- **Permissions Defined**: 22
- **Default Settings**: 7
- **RLS Policies**: 60+ policies across all tables
- **Triggers**: 10+ for automatic updates
- **Indexes**: 50+ for performance optimization

---

## Support

For questions or issues, refer to:
- Supabase Documentation: https://supabase.com/docs
- PostgreSQL Documentation: https://www.postgresql.org/docs/
- Express.js Documentation: https://expressjs.com/

---

**Document Version**: 1.0.0
**Last Updated**: 2026-03-03
**Database Version**: v1 (Initial Schema)

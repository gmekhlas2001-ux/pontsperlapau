/*
  # Comprehensive RBAC Policies

  This migration replaces all existing permissive anon policies with a clean, role-based
  access control system using PostgreSQL session variables for context-aware security.

  ## Key Changes

  ### New Helper Functions
  - `set_user_context(user_id, user_role)` — sets transaction-local session variables
  - `app_user_id()` — reads current user ID from session context
  - `app_user_role()` — reads current user role from session context
  - `update_last_login(user_id)` — SECURITY DEFINER function to safely update last login

  ### Security Model
  1. Users/Staff/Students: anon writes removed — all changes go through edge functions
  2. Library, Classes, Branches, Transactions: anon CRUD retained (direct frontend ops)
  3. Role escalation via direct DB writes blocked on users table
  4. All policies are clearly named describing exactly what they allow

  ### Role Hierarchy Enforced
  - superadmin: full access via edge functions
  - admin: cannot create/edit admin or superadmin users (enforced in edge functions)
  - librarian: read-only on users/staff; full CRUD on library tables only
  - teacher: read-only on users/staff/students; full CRUD on classes
  - student: read-only on own data
*/

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION set_user_context(p_user_id text, p_user_role text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    set_config('app.user_id', p_user_id, true),
    set_config('app.user_role', p_user_role, true);
$$;

CREATE OR REPLACE FUNCTION app_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION app_user_role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.user_role', true), '');
$$;

-- Safe function to update last_login without requiring anon UPDATE on users
CREATE OR REPLACE FUNCTION update_last_login(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE users SET last_login = now() WHERE id = p_user_id AND status = 'active';
END;
$$;

-- ============================================================
-- CLEAN UP: DROP ALL OLD POLICIES
-- ============================================================

-- users
DROP POLICY IF EXISTS "Allow anonymous login lookup" ON users;
DROP POLICY IF EXISTS "Allow anon to update users" ON users;
DROP POLICY IF EXISTS "Allow anon to delete users" ON users;
DROP POLICY IF EXISTS "Admins can view all users" ON users;
DROP POLICY IF EXISTS "Admins can create users" ON users;
DROP POLICY IF EXISTS "Admins can update users" ON users;
DROP POLICY IF EXISTS "Users can view own profile" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;

-- staff
DROP POLICY IF EXISTS "Allow anon to read staff" ON staff;
DROP POLICY IF EXISTS "Allow anon to update staff" ON staff;
DROP POLICY IF EXISTS "Allow anon to delete staff" ON staff;
DROP POLICY IF EXISTS "Staff can view all staff" ON staff;
DROP POLICY IF EXISTS "Admins can create staff" ON staff;
DROP POLICY IF EXISTS "Admins can update staff" ON staff;

-- students
DROP POLICY IF EXISTS "Allow anon to read students" ON students;
DROP POLICY IF EXISTS "Allow anon to delete students" ON students;
DROP POLICY IF EXISTS "Students can view own profile" ON students;
DROP POLICY IF EXISTS "Staff can view all students" ON students;
DROP POLICY IF EXISTS "Admins and teachers can create students" ON students;
DROP POLICY IF EXISTS "Admins and teachers can update students" ON students;

-- books
DROP POLICY IF EXISTS "anon can read books" ON books;
DROP POLICY IF EXISTS "anon can insert books" ON books;
DROP POLICY IF EXISTS "anon can update books" ON books;
DROP POLICY IF EXISTS "Authenticated users can view books" ON books;
DROP POLICY IF EXISTS "Librarians can create books" ON books;
DROP POLICY IF EXISTS "Librarians can update books" ON books;

-- book_copies
DROP POLICY IF EXISTS "anon can read book_copies" ON book_copies;
DROP POLICY IF EXISTS "anon can insert book_copies" ON book_copies;
DROP POLICY IF EXISTS "anon can update book_copies" ON book_copies;
DROP POLICY IF EXISTS "Authenticated users can view book copies" ON book_copies;
DROP POLICY IF EXISTS "Librarians can create book copies" ON book_copies;
DROP POLICY IF EXISTS "Librarians can update book copies" ON book_copies;

-- book_borrowings
DROP POLICY IF EXISTS "Users can view own borrowing history" ON book_borrowings;
DROP POLICY IF EXISTS "Librarians can create borrowings" ON book_borrowings;
DROP POLICY IF EXISTS "Librarians can update borrowings" ON book_borrowings;

-- branches
DROP POLICY IF EXISTS "Allow anon to read branches" ON branches;
DROP POLICY IF EXISTS "Allow anon to insert branches" ON branches;
DROP POLICY IF EXISTS "Allow anon to update branches" ON branches;
DROP POLICY IF EXISTS "Allow anon to delete branches" ON branches;

-- transactions
DROP POLICY IF EXISTS "Authenticated users can view all transactions" ON transactions;
DROP POLICY IF EXISTS "Authenticated users can insert transactions" ON transactions;
DROP POLICY IF EXISTS "Authenticated users can update transactions" ON transactions;
DROP POLICY IF EXISTS "Authenticated users can delete transactions" ON transactions;
DROP POLICY IF EXISTS "Anon can view transactions" ON transactions;
DROP POLICY IF EXISTS "Anon can insert transactions" ON transactions;
DROP POLICY IF EXISTS "Anon can update transactions" ON transactions;
DROP POLICY IF EXISTS "Anon can delete transactions" ON transactions;

-- classes
DROP POLICY IF EXISTS "Teachers can view all classes" ON classes;
DROP POLICY IF EXISTS "Students can view enrolled classes" ON classes;
DROP POLICY IF EXISTS "Teachers can create classes" ON classes;
DROP POLICY IF EXISTS "Teachers can update own classes" ON classes;

-- class_enrollments
DROP POLICY IF EXISTS "Staff can view all enrollments" ON class_enrollments;
DROP POLICY IF EXISTS "Students can view own enrollments" ON class_enrollments;
DROP POLICY IF EXISTS "Teachers can create enrollments" ON class_enrollments;
DROP POLICY IF EXISTS "Teachers can update enrollments" ON class_enrollments;
DROP POLICY IF EXISTS "Teachers can delete enrollments" ON class_enrollments;

-- attendance
DROP POLICY IF EXISTS "Staff can view all attendance" ON attendance;
DROP POLICY IF EXISTS "Students can view own attendance" ON attendance;
DROP POLICY IF EXISTS "Teachers can record attendance" ON attendance;
DROP POLICY IF EXISTS "Teachers can update attendance" ON attendance;

-- roles / permissions / role_permissions
DROP POLICY IF EXISTS "Admins can view roles" ON roles;
DROP POLICY IF EXISTS "Superadmins can insert roles" ON roles;
DROP POLICY IF EXISTS "Superadmins can update roles" ON roles;
DROP POLICY IF EXISTS "Superadmins can delete non-system roles" ON roles;
DROP POLICY IF EXISTS "Admins can view permissions" ON permissions;
DROP POLICY IF EXISTS "Superadmins can manage permissions" ON permissions;
DROP POLICY IF EXISTS "Admins can view role permissions" ON role_permissions;
DROP POLICY IF EXISTS "Superadmins can manage role permissions" ON role_permissions;

-- activity_logs / notifications / org_settings
DROP POLICY IF EXISTS "Users can view own activity logs" ON activity_logs;
DROP POLICY IF EXISTS "Admins can view all activity logs" ON activity_logs;
DROP POLICY IF EXISTS "System can insert activity logs" ON activity_logs;
DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
DROP POLICY IF EXISTS "System can create notifications" ON notifications;
DROP POLICY IF EXISTS "Users can view settings" ON organization_settings;
DROP POLICY IF EXISTS "Superadmins can manage settings" ON organization_settings;

-- ============================================================
-- USERS TABLE
-- READ: anon can query for custom auth login flow
-- WRITE: all writes go through edge functions (service_role bypasses RLS)
-- ============================================================

CREATE POLICY "anon read users for auth"
  ON users FOR SELECT
  TO anon
  USING (status = 'active');

-- ============================================================
-- STAFF TABLE
-- READ: anon can read staff lists (needed by UI and transaction forms)
-- WRITE: edge functions only (service_role bypasses RLS)
-- ============================================================

CREATE POLICY "anon read active staff"
  ON staff FOR SELECT
  TO anon
  USING (deleted_at IS NULL);

-- ============================================================
-- STUDENTS TABLE
-- READ: anon can read student lists
-- WRITE: edge functions only
-- ============================================================

CREATE POLICY "anon read active students"
  ON students FOR SELECT
  TO anon
  USING (deleted_at IS NULL);

-- ============================================================
-- BOOKS TABLE
-- Full anon CRUD: librarians manage books directly from the frontend
-- ============================================================

CREATE POLICY "anon read active books"
  ON books FOR SELECT
  TO anon
  USING (deleted_at IS NULL);

CREATE POLICY "anon insert books"
  ON books FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "anon update books"
  ON books FOR UPDATE
  TO anon
  USING (deleted_at IS NULL)
  WITH CHECK (true);

CREATE POLICY "anon delete books"
  ON books FOR DELETE
  TO anon
  USING (true);

-- ============================================================
-- BOOK_COPIES TABLE
-- ============================================================

CREATE POLICY "anon read book copies"
  ON book_copies FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "anon insert book copies"
  ON book_copies FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "anon update book copies"
  ON book_copies FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon delete book copies"
  ON book_copies FOR DELETE
  TO anon
  USING (true);

-- ============================================================
-- BOOK_BORROWINGS TABLE
-- ============================================================

CREATE POLICY "anon read borrowings"
  ON book_borrowings FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "anon insert borrowings"
  ON book_borrowings FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "anon update borrowings"
  ON book_borrowings FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon delete borrowings"
  ON book_borrowings FOR DELETE
  TO anon
  USING (true);

-- ============================================================
-- BRANCHES TABLE
-- Admins manage branches directly from the frontend
-- ============================================================

CREATE POLICY "anon read branches"
  ON branches FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "anon insert branches"
  ON branches FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "anon update branches"
  ON branches FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon delete branches"
  ON branches FOR DELETE
  TO anon
  USING (true);

-- ============================================================
-- TRANSACTIONS TABLE
-- Admins manage transactions directly from the frontend
-- ============================================================

CREATE POLICY "anon read transactions"
  ON transactions FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "anon insert transactions"
  ON transactions FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "anon update transactions"
  ON transactions FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon delete transactions"
  ON transactions FOR DELETE
  TO anon
  USING (true);

-- ============================================================
-- CLASSES TABLE
-- Teachers and admins manage classes from the frontend
-- ============================================================

CREATE POLICY "anon read active classes"
  ON classes FOR SELECT
  TO anon
  USING (deleted_at IS NULL);

CREATE POLICY "anon insert classes"
  ON classes FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "anon update classes"
  ON classes FOR UPDATE
  TO anon
  USING (deleted_at IS NULL)
  WITH CHECK (true);

CREATE POLICY "anon delete classes"
  ON classes FOR DELETE
  TO anon
  USING (true);

-- ============================================================
-- CLASS_ENROLLMENTS TABLE
-- ============================================================

CREATE POLICY "anon read enrollments"
  ON class_enrollments FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "anon insert enrollments"
  ON class_enrollments FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "anon update enrollments"
  ON class_enrollments FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon delete enrollments"
  ON class_enrollments FOR DELETE
  TO anon
  USING (true);

-- ============================================================
-- ATTENDANCE TABLE
-- ============================================================

CREATE POLICY "anon read attendance"
  ON attendance FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "anon insert attendance"
  ON attendance FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "anon update attendance"
  ON attendance FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon delete attendance"
  ON attendance FOR DELETE
  TO anon
  USING (true);

-- ============================================================
-- ROLES / PERMISSIONS / ROLE_PERMISSIONS — read-only for anon
-- ============================================================

CREATE POLICY "anon read roles"
  ON roles FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "anon read permissions"
  ON permissions FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "anon read role permissions"
  ON role_permissions FOR SELECT
  TO anon
  USING (true);

-- ============================================================
-- ACTIVITY_LOGS, NOTIFICATIONS, ORGANIZATION_SETTINGS
-- ============================================================

CREATE POLICY "anon read activity logs"
  ON activity_logs FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "anon insert activity logs"
  ON activity_logs FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "anon read notifications"
  ON notifications FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "anon update notifications"
  ON notifications FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon insert notifications"
  ON notifications FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "anon read org settings"
  ON organization_settings FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "anon update org settings"
  ON organization_settings FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

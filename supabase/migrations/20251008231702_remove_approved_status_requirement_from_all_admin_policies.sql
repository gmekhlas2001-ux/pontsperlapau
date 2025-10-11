/*
  # Remove Approved Status Requirement from All Admin Policies

  1. Changes
    - Remove status = 'approved' requirement from all admin RLS policies
    - All admins should have access regardless of status (approved or active)
    
  2. Tables Updated
    - approvals
    - audit_log
    - class_teachers
    - documents
    - enrollments
    - library_visits
*/

-- Fix approvals table policies
DROP POLICY IF EXISTS "Admins can view all approvals" ON approvals;
DROP POLICY IF EXISTS "Admins can update approvals" ON approvals;

CREATE POLICY "Admins can view all approvals"
  ON approvals FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.auth_user_id = auth.uid()
      AND profiles.role_id = 'admin'
    )
  );

CREATE POLICY "Admins can update approvals"
  ON approvals FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.auth_user_id = auth.uid()
      AND profiles.role_id = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.auth_user_id = auth.uid()
      AND profiles.role_id = 'admin'
    )
  );

-- Fix audit_log policies
DROP POLICY IF EXISTS "Admins can view audit log" ON audit_log;

CREATE POLICY "Admins can view audit log"
  ON audit_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.auth_user_id = auth.uid()
      AND profiles.role_id = 'admin'
    )
  );

-- Fix class_teachers policies
DROP POLICY IF EXISTS "Admins can manage class assignments" ON class_teachers;

CREATE POLICY "Admins can manage class assignments"
  ON class_teachers FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.auth_user_id = auth.uid()
      AND profiles.role_id = 'admin'
    )
  );

-- Fix documents policies
DROP POLICY IF EXISTS "Admins can view all documents" ON documents;
DROP POLICY IF EXISTS "Admins can manage documents" ON documents;

CREATE POLICY "Admins can view all documents"
  ON documents FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.auth_user_id = auth.uid()
      AND profiles.role_id = 'admin'
    )
  );

CREATE POLICY "Admins can manage documents"
  ON documents FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.auth_user_id = auth.uid()
      AND profiles.role_id = 'admin'
    )
  );

-- Fix enrollments policies
DROP POLICY IF EXISTS "Admins can manage enrollments" ON enrollments;

CREATE POLICY "Admins can manage enrollments"
  ON enrollments FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.auth_user_id = auth.uid()
      AND profiles.role_id = 'admin'
    )
  );

-- Fix library_visits policies
DROP POLICY IF EXISTS "Admins and librarians can manage library visits" ON library_visits;

CREATE POLICY "Admins and librarians can manage library visits"
  ON library_visits FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.auth_user_id = auth.uid()
      AND profiles.role_id IN ('admin', 'librarian')
    )
  );

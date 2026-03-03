/*
  # Restore Users Table RLS Policies
  
  ## Overview
  This migration restores missing RLS policies for the users table to ensure proper access control.
  
  ## Security Changes
  
  ### Policies Created
  1. Users can view their own profile
  2. Users can update their own non-sensitive fields
  3. Admins and superadmins can view all users
  4. Admins and superadmins can create users
  5. Admins and superadmins can update users (only superadmins can change roles)
  
  ## Notes
  - Superadmins have full control including role management
  - Regular admins can update most fields but not roles
  - Users can update their own profile but not sensitive fields
*/

-- Drop existing policies if they exist and recreate
DROP POLICY IF EXISTS "Users can view own profile" ON users;
CREATE POLICY "Users can view own profile"
  ON users FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON users;
CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id AND
    email = (SELECT email FROM users WHERE id = auth.uid()) AND
    password_hash = (SELECT password_hash FROM users WHERE id = auth.uid()) AND
    role = (SELECT role FROM users WHERE id = auth.uid()) AND
    status = (SELECT status FROM users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Admins can view all users" ON users;
CREATE POLICY "Admins can view all users"
  ON users FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('admin', 'superadmin')
      AND status = 'active'
    )
  );

DROP POLICY IF EXISTS "Admins can create users" ON users;
CREATE POLICY "Admins can create users"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('admin', 'superadmin')
      AND status = 'active'
    )
  );

DROP POLICY IF EXISTS "Admins can update users" ON users;
CREATE POLICY "Admins can update users"
  ON users FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('admin', 'superadmin')
      AND status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('admin', 'superadmin')
      AND status = 'active'
    ) AND
    (
      role = (SELECT role FROM users WHERE id = users.id) OR
      EXISTS (
        SELECT 1 FROM users
        WHERE id = auth.uid()
        AND role = 'superadmin'
      )
    )
  );
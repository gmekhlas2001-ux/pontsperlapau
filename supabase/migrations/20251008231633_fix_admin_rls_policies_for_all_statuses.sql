/*
  # Fix Admin RLS Policies to Work with All Admin Statuses

  1. Changes
    - Update staff and students RLS policies to allow admins regardless of status
    - Remove the requirement for status = 'approved' for admins
    - All admins (approved or active status) should have full access

  2. Security
    - Still maintain that only admins can manage staff and students
    - Just remove the status check that was blocking active admins
*/

-- Drop existing policies for staff
DROP POLICY IF EXISTS "Admins can manage staff" ON staff;
DROP POLICY IF EXISTS "Admins can view all staff" ON staff;

-- Create new policies without status requirement
CREATE POLICY "Admins can manage staff"
  ON staff FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.auth_user_id = auth.uid()
      AND profiles.role_id = 'admin'
    )
  );

CREATE POLICY "Admins can view all staff"
  ON staff FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.auth_user_id = auth.uid()
      AND profiles.role_id = 'admin'
    )
  );

-- Drop existing policies for students
DROP POLICY IF EXISTS "Admins can manage students" ON students;
DROP POLICY IF EXISTS "Admins can view all students" ON students;

-- Create new policies without status requirement
CREATE POLICY "Admins can manage students"
  ON students FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.auth_user_id = auth.uid()
      AND profiles.role_id = 'admin'
    )
  );

CREATE POLICY "Admins can view all students"
  ON students FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.auth_user_id = auth.uid()
      AND profiles.role_id = 'admin'
    )
  );

-- Update branches policy
DROP POLICY IF EXISTS "Admins can manage branches" ON branches;

CREATE POLICY "Admins can manage branches"
  ON branches FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.auth_user_id = auth.uid()
      AND profiles.role_id = 'admin'
    )
  );

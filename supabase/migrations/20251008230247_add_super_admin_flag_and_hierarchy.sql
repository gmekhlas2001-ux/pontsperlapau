/*
  # Add Super Admin Hierarchy System

  1. Changes
    - Add `is_super_admin` boolean column to profiles table
    - Set 1st.mekhlas@gmail.com as the super admin
    - Update RLS policies to enforce admin hierarchy
  
  2. Permission Structure
    - Super Admin (1st.mekhlas@gmail.com): Full access to everything including deleting other admins
    - Regular Admins: Full access to students, staff, branches, classrooms, library, etc. but CANNOT delete other admins
    - Teachers: Limited access to their own classrooms and students
    - Students: Limited access to their own data

  3. Security Rules
    - Only super admin can delete admin users
    - Only super admin can promote users to admin
    - Regular admins can promote users to teacher/staff but not admin
    - All admins can view all data
*/

-- Add super_admin flag to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT false;

-- Set 1st.mekhlas@gmail.com as the super admin
UPDATE profiles 
SET is_super_admin = true 
WHERE email = '1st.mekhlas@gmail.com';

-- Create a helper function to check if current user is super admin
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE auth_user_id = auth.uid()
    AND is_super_admin = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a helper function to check if current user is any admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE auth_user_id = auth.uid()
    AND role_id = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update profiles DELETE policy to only allow super admin to delete admins
DROP POLICY IF EXISTS "Admins can delete profiles" ON profiles;

CREATE POLICY "Super admin can delete any profile"
  ON profiles FOR DELETE
  TO authenticated
  USING (is_super_admin());

CREATE POLICY "Regular admins can delete non-admin profiles"
  ON profiles FOR DELETE
  TO authenticated
  USING (
    is_admin() 
    AND NOT is_super_admin()
    AND role_id != 'admin'
  );

-- Update profiles UPDATE policy for role changes
DROP POLICY IF EXISTS "Admins can update profiles" ON profiles;

CREATE POLICY "Super admin can update any profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "Regular admins can update non-admin profiles"
  ON profiles FOR UPDATE
  TO authenticated
  USING (
    is_admin() 
    AND NOT is_super_admin()
    AND role_id != 'admin'
  )
  WITH CHECK (
    is_admin() 
    AND NOT is_super_admin()
    AND role_id != 'admin'
  );

-- Ensure users can still update their own profile
CREATE POLICY "Users can update own non-role fields"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (
    auth_user_id = auth.uid()
    -- Prevent users from changing their own role or super_admin status
    AND role_id = (SELECT role_id FROM profiles WHERE auth_user_id = auth.uid())
    AND (is_super_admin IS NULL OR is_super_admin = (SELECT is_super_admin FROM profiles WHERE auth_user_id = auth.uid()))
  );

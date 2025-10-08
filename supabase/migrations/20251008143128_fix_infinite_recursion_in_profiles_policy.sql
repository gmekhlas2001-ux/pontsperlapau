/*
  # Fix Infinite Recursion in Profiles RLS Policy

  1. Changes
    - Drop the existing "Admins can view all profiles" policy that causes infinite recursion
    - Create a new policy using a subquery approach to avoid the recursion
    
  2. Security
    - Admins with approved status can view all profiles
    - Uses a lateral join to avoid recursion issues
*/

DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;

CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    (
      SELECT role_id = 'admin' AND status = 'approved'
      FROM profiles AS p
      WHERE p.auth_user_id = auth.uid()
      LIMIT 1
    )
  );

DROP POLICY IF EXISTS "Admins can update profiles" ON profiles;

CREATE POLICY "Admins can update profiles"
  ON profiles FOR UPDATE
  TO authenticated
  USING (
    (
      SELECT role_id = 'admin' AND status = 'approved'
      FROM profiles AS p
      WHERE p.auth_user_id = auth.uid()
      LIMIT 1
    )
  )
  WITH CHECK (
    (
      SELECT role_id = 'admin' AND status = 'approved'
      FROM profiles AS p
      WHERE p.auth_user_id = auth.uid()
      LIMIT 1
    )
  );
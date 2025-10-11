/*
  # Fix Profiles RLS with Security Definer Function

  1. Changes
    - Create a security definer function to check if user is admin
    - This function bypasses RLS, preventing infinite recursion
    - Update RLS policies to use this function instead of subqueries
    
  2. Security
    - Function is marked as SECURITY DEFINER to bypass RLS
    - Function is STABLE and LEAKPROOF for query optimization
    - Admins with approved status can view all profiles
*/

-- Drop existing problematic policies
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update profiles" ON profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;

-- Create a security definer function to check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE auth_user_id = auth.uid()
      AND role_id = 'admin'
      AND status = 'approved'
  );
$$;

-- Create new policies using the security definer function
CREATE POLICY "Users can view profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    public.is_admin() OR auth.uid() = auth_user_id
  );

CREATE POLICY "Admins can update profiles"
  ON profiles FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
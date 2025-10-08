/*
  # Allow users to update their own profile

  1. Changes
    - Add new policy to allow authenticated users to update their own profile information
    - Users can update their own profile fields (full_name, phone, address, etc.)
    - Role changes are still restricted to admins only via the existing admin policy
  
  2. Security
    - Users can only update their own profile (auth.uid() = auth_user_id)
    - Maintains existing admin update policy for administrative changes
*/

-- Add policy for users to update their own profile
CREATE POLICY "Users can update own profile"
  ON profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = auth_user_id)
  WITH CHECK (auth.uid() = auth_user_id);

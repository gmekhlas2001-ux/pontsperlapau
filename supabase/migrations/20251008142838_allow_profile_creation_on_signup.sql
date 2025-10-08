/*
  # Allow Profile Creation During Signup

  1. Changes
    - Add policy to allow authenticated users to insert their own profile
    - This enables new users to create their profile during registration

  2. Security
    - Users can only insert profiles for themselves (their own auth.uid())
    - Prevents users from creating profiles for other users
*/

CREATE POLICY "Users can create own profile"
  ON profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = auth_user_id);
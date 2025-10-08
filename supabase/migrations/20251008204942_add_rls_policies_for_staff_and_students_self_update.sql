/*
  # Add RLS policies for staff and students to update their own records

  1. Changes
    - Add SELECT policy for users to view their own staff/student record
    - Add UPDATE policy for users to update their own staff/student record
    - Add INSERT policy for users to create their own staff/student record (if missing)
  
  2. Security
    - Users can only access records linked to their profile_id
    - Admins retain full access through existing policies
*/

CREATE POLICY "Users can view own staff record"
  ON staff
  FOR SELECT
  TO authenticated
  USING (
    profile_id IN (
      SELECT id FROM profiles WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own staff record"
  ON staff
  FOR UPDATE
  TO authenticated
  USING (
    profile_id IN (
      SELECT id FROM profiles WHERE auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    profile_id IN (
      SELECT id FROM profiles WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own staff record"
  ON staff
  FOR INSERT
  TO authenticated
  WITH CHECK (
    profile_id IN (
      SELECT id FROM profiles WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view own student record"
  ON students
  FOR SELECT
  TO authenticated
  USING (
    profile_id IN (
      SELECT id FROM profiles WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own student record"
  ON students
  FOR UPDATE
  TO authenticated
  USING (
    profile_id IN (
      SELECT id FROM profiles WHERE auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    profile_id IN (
      SELECT id FROM profiles WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own student record"
  ON students
  FOR INSERT
  TO authenticated
  WITH CHECK (
    profile_id IN (
      SELECT id FROM profiles WHERE auth_user_id = auth.uid()
    )
  );

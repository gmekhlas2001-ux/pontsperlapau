/*
  # Add DELETE policies for profiles, staff, and students tables

  1. Changes
    - Add DELETE policy for admins to delete profiles
    - Ensure staff and students can be deleted via CASCADE when profile is deleted
  
  2. Security
    - Only admins can delete profiles
    - Deleting a profile should cascade to staff/students records
    - This is a destructive operation and should only be available to admins
*/

-- Add DELETE policy for admins on profiles table
CREATE POLICY "Admins can delete profiles"
  ON profiles
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles AS p
      WHERE p.auth_user_id = auth.uid()
      AND p.role_id = 'admin'
      AND p.status = 'active'
    )
  );

-- Ensure staff table has CASCADE delete on profile_id
DO $$ 
BEGIN
  -- Drop existing foreign key if exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'staff_profile_id_fkey' 
    AND table_name = 'staff'
  ) THEN
    ALTER TABLE staff DROP CONSTRAINT staff_profile_id_fkey;
  END IF;
  
  -- Re-add with CASCADE
  ALTER TABLE staff 
    ADD CONSTRAINT staff_profile_id_fkey 
    FOREIGN KEY (profile_id) 
    REFERENCES profiles(id) 
    ON DELETE CASCADE;
END $$;

-- Ensure students table has CASCADE delete on profile_id
DO $$ 
BEGIN
  -- Drop existing foreign key if exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'students_profile_id_fkey' 
    AND table_name = 'students'
  ) THEN
    ALTER TABLE students DROP CONSTRAINT students_profile_id_fkey;
  END IF;
  
  -- Re-add with CASCADE
  ALTER TABLE students 
    ADD CONSTRAINT students_profile_id_fkey 
    FOREIGN KEY (profile_id) 
    REFERENCES profiles(id) 
    ON DELETE CASCADE;
END $$;

/*
  # Add anon DELETE policies for hard deletes

  ## Summary
  Previously, deleting a student or staff member only did a soft delete (setting deleted_at).
  Now delete performs a hard DELETE from the database, so anon needs DELETE permission on:
  - students
  - staff
  - users

  ## Changes
  1. Add DELETE policy on `students` for anon role
  2. Add DELETE policy on `staff` for anon role
  3. Add DELETE policy on `users` for anon role
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'students' AND policyname = 'Allow anon to delete students'
  ) THEN
    CREATE POLICY "Allow anon to delete students"
      ON students FOR DELETE TO anon USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'staff' AND policyname = 'Allow anon to delete staff'
  ) THEN
    CREATE POLICY "Allow anon to delete staff"
      ON staff FOR DELETE TO anon USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'users' AND policyname = 'Allow anon to delete users'
  ) THEN
    CREATE POLICY "Allow anon to delete users"
      ON users FOR DELETE TO anon USING (true);
  END IF;
END $$;

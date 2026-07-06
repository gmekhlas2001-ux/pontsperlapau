/*
  # Add anon DELETE/soft-delete policies for staff and users

  This app uses custom auth (no Supabase Auth), queries run as anon role.
  We implement soft deletes via deleted_at timestamp rather than hard deletes.

  ## Changes
  - Add UPDATE policy on `staff` for anon (for setting deleted_at)
  - Add UPDATE policy on `users` for anon (for setting status to inactive on delete)

  Note: UPDATE policies on staff/users for anon already exist from previous migration,
  this migration is a no-op safety check.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'staff' AND policyname = 'Allow anon to update staff'
  ) THEN
    CREATE POLICY "Allow anon to update staff"
      ON staff FOR UPDATE TO anon USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'users' AND policyname = 'Allow anon to update users'
  ) THEN
    CREATE POLICY "Allow anon to update users"
      ON users FOR UPDATE TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;

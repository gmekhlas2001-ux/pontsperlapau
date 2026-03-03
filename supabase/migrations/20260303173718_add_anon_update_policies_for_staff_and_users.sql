/*
  # Add anon UPDATE policies for staff and users

  This app uses custom authentication (not Supabase Auth), so all queries run
  as the anon role. The previous migration added SELECT policies; now we add
  UPDATE policies so the staff edit feature can persist changes.

  ## Changes
  - Add UPDATE policy on `users` for anon role
  - Add UPDATE policy on `staff` for anon role

  ## Security note
  Access control is enforced at the application level (session check + role check
  in the UI and create-user edge function). Supabase RLS here serves as a
  permissive layer since the app does not use Supabase Auth.
*/

CREATE POLICY "Allow anon to update users"
  ON users
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow anon to update staff"
  ON staff
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

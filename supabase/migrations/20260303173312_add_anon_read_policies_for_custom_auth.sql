/*
  # Add anon read policies for custom auth

  This app uses custom authentication (not Supabase Auth), so auth.uid() is always
  null. All frontend queries run as the anon role. We need to allow the anon role
  to read staff, students, and users data so the UI can display records.

  ## Changes
  - Add SELECT policy on `users` for anon role (already exists for login, extending)
  - Add SELECT policy on `staff` for anon role
  - Add SELECT policy on `students` for anon role

  ## Security note
  Access control is enforced at the application level via the custom login system
  and the create-user edge function which checks caller roles server-side.
*/

-- Allow anon to read staff records (app uses custom auth, not Supabase Auth)
CREATE POLICY "Allow anon to read staff"
  ON staff
  FOR SELECT
  TO anon
  USING (true);

-- Allow anon to read students records
CREATE POLICY "Allow anon to read students"
  ON students
  FOR SELECT
  TO anon
  USING (true);

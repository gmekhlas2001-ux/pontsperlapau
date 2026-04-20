/*
  Allow anon role to read all users regardless of status.

  Previously the policy restricted reads to status = 'active', which caused
  inactive staff and student records to vanish from the UI entirely — the
  students/staff tables join to users, and PostgREST excluded parent rows
  when the joined user row was blocked by RLS.

  Login protection against inactive accounts is enforced at the application
  level (update_last_login checks status = 'active'), so this RLS restriction
  is not needed for security.
*/

DROP POLICY IF EXISTS "anon read users for auth" ON users;

CREATE POLICY "anon read users"
  ON users FOR SELECT
  TO anon
  USING (true);

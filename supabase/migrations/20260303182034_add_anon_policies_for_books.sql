/*
  # Add anon access policies for books table

  ## Summary
  Adds RLS policies allowing anonymous (custom auth) users to perform full CRUD
  on the books table, consistent with the pattern used for staff and students.

  ## Changes
  - SELECT policy: anon can read non-deleted books
  - INSERT policy: anon can add books
  - UPDATE policy: anon can update books
  - DELETE (soft): anon can set deleted_at on books
*/

CREATE POLICY "anon can read books"
  ON books FOR SELECT
  TO anon
  USING (deleted_at IS NULL);

CREATE POLICY "anon can insert books"
  ON books FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "anon can update books"
  ON books FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

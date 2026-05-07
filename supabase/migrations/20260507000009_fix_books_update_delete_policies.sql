/*
  # Fix books RLS — UPDATE and DELETE blocked for anon/authenticated

  ## Problem
  Editing or deleting a book fails with:
    "new row violates row-level security policy for table 'books'"

  The UPDATE policy "anon update books" was created with
    USING (deleted_at IS NULL) WITH CHECK (true)
  in migration 20260306024437. When migration 20260507000008 tried to
  clone it for the authenticated role, it read the USING clause from
  pg_policies.qual and may have used it for BOTH USING and WITH CHECK.
  That means the soft-delete UPDATE (which sets deleted_at to a timestamp)
  produces a new row where deleted_at IS NOT NULL, failing WITH CHECK.

  ## Fix
  Drop all UPDATE and DELETE policies on books, then create clean
  replacements that:
    - allow USING (true)   — any row can be targeted
    - allow WITH CHECK (true) — any resulting row is accepted
  for both anon and authenticated roles.
*/

-- Drop every existing UPDATE / DELETE / ALL policy on books
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM   pg_policies
    WHERE  schemaname = 'public'
      AND  tablename  = 'books'
      AND  cmd IN ('UPDATE', 'DELETE', 'ALL')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON books', pol.policyname);
  END LOOP;
END $$;

-- Fresh UPDATE policy — permissive for the app's custom-auth model
CREATE POLICY "books_update"
  ON books FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Fresh DELETE policy (hard deletes via DB tooling; app uses soft-delete)
CREATE POLICY "books_delete"
  ON books FOR DELETE
  TO anon, authenticated
  USING (true);

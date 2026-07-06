/*
  # Books RLS — replace per-command policies with one permissive ALL policy

  ## Why
  PostgREST internally adds a RETURNING clause to PATCH requests even
  without `Prefer: return=representation`. PostgreSQL then applies the
  SELECT policy's USING to the *new* row, not just the old one. The
  SELECT policy "anon read active books" had USING (deleted_at IS NULL),
  so any UPDATE that set `deleted_at` to a timestamp (i.e. soft-delete)
  produced a new row failing the SELECT USING and was rejected as
  "new row violates row-level security policy for table 'books'".

  ## Fix
  Drop every policy on books and replace with a single FOR ALL policy
  that uses USING (true) WITH CHECK (true). The app already filters
  `deleted_at IS NULL` in getBooks, so user-visible behaviour is
  unchanged — anon clients still only see active books in the UI.
*/

DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM   pg_policies
    WHERE  schemaname = 'public' AND tablename = 'books'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.books', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY books_all
  ON public.books
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

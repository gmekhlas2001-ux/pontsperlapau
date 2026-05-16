/*
  # Restore browser read access for active books

  The table-write lock migration removed INSERT/UPDATE/DELETE/ALL policies so
  writes go through the app-actions Edge Function. Books previously had a
  single FOR ALL policy, so removing ALL also removed SELECT access and made
  the library appear empty in the browser.

  Keep writes locked, but allow the SPA to read non-deleted catalog rows.
*/

DROP POLICY IF EXISTS books_read_active ON public.books;

CREATE POLICY books_read_active
  ON public.books
  FOR SELECT
  TO anon, authenticated
  USING (deleted_at IS NULL);

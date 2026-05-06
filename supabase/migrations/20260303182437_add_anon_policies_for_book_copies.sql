/*
  # Add anon access policies for book_copies table

  ## Summary
  The books table has a trigger (create_copies_on_book_insert) that automatically
  inserts rows into book_copies when a book is created. Since the app uses custom
  (anon role) authentication, anon also needs RLS policies on book_copies to allow
  the trigger to succeed and for general book copy management.

  ## Changes
  - SELECT policy: anon can read book copies
  - INSERT policy: anon can insert book copies (required by the trigger)
  - UPDATE policy: anon can update book copies
*/

CREATE POLICY "anon can read book_copies"
  ON book_copies FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "anon can insert book_copies"
  ON book_copies FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "anon can update book_copies"
  ON book_copies FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

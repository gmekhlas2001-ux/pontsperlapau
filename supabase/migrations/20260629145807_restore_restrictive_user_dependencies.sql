/*
  Restore defensive deletion rules for records that still carry operational
  responsibilities. The Edge Function performs a friendly preflight check;
  these foreign keys remain the final race-condition-safe backstop.

  Columns stay nullable because historical records may already have been
  deliberately anonymised. New classes still require a teacher in the app.
*/

ALTER TABLE public.classes
  DROP CONSTRAINT IF EXISTS classes_teacher_id_fkey;

ALTER TABLE public.classes
  ADD CONSTRAINT classes_teacher_id_fkey
  FOREIGN KEY (teacher_id)
  REFERENCES public.staff(id)
  ON DELETE RESTRICT;

ALTER TABLE public.book_borrowings
  DROP CONSTRAINT IF EXISTS book_borrowings_borrower_id_fkey;

ALTER TABLE public.book_borrowings
  ADD CONSTRAINT book_borrowings_borrower_id_fkey
  FOREIGN KEY (borrower_id)
  REFERENCES public.users(id)
  ON DELETE RESTRICT;

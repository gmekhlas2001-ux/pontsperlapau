/*
  Allow a user account to be hard-deleted without erasing institutional
  history that refers to that person.

  The original RESTRICT foreign keys made delete_user_cascade fail whenever:
    - a staff member was assigned as a class teacher; or
    - a user had a library borrowing record.

  Preserve those records and anonymise the reference instead. New and edited
  classes still require a teacher at the application boundary; only deletion
  can leave an existing record unassigned.
*/

ALTER TABLE public.classes
  ALTER COLUMN teacher_id DROP NOT NULL;

ALTER TABLE public.classes
  DROP CONSTRAINT IF EXISTS classes_teacher_id_fkey;

ALTER TABLE public.classes
  ADD CONSTRAINT classes_teacher_id_fkey
  FOREIGN KEY (teacher_id)
  REFERENCES public.staff(id)
  ON DELETE SET NULL;

ALTER TABLE public.book_borrowings
  ALTER COLUMN borrower_id DROP NOT NULL;

ALTER TABLE public.book_borrowings
  DROP CONSTRAINT IF EXISTS book_borrowings_borrower_id_fkey;

ALTER TABLE public.book_borrowings
  ADD CONSTRAINT book_borrowings_borrower_id_fkey
  FOREIGN KEY (borrower_id)
  REFERENCES public.users(id)
  ON DELETE SET NULL;

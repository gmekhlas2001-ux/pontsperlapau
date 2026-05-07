/*
  # Normalise empty-string ISBNs (and similar fields) to NULL on books

  The edit form was sending `isbn: ''` for books with no ISBN, which
  collided with the UNIQUE constraint `books_isbn_key` whenever any other
  row also had an empty-string ISBN. UNIQUE allows multiple NULLs, but
  rejects multiple empty strings.

  Backfill any existing rows so the constraint is satisfied and future
  edits don't reintroduce duplicates.
*/

UPDATE public.books SET isbn = NULL WHERE isbn = '';

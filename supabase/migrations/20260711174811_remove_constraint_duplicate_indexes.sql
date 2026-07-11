-- Unique constraints already provide indexes for these exact columns.
DROP INDEX IF EXISTS public.idx_staff_user_id;
DROP INDEX IF EXISTS public.idx_students_user_id;
DROP INDEX IF EXISTS public.idx_students_student_id;
DROP INDEX IF EXISTS public.idx_books_isbn;
DROP INDEX IF EXISTS public.idx_book_copies_barcode;
DROP INDEX IF EXISTS public.idx_roles_name;
DROP INDEX IF EXISTS public.idx_permissions_name;
DROP INDEX IF EXISTS public.idx_organization_settings_key;
DROP INDEX IF EXISTS public.idx_sbs_survey_branch;

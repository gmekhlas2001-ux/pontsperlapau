-- Index foreign-key columns used for relationship checks and cascading work.
CREATE INDEX IF NOT EXISTS idx_attendance_recorded_by ON public.attendance(recorded_by);
CREATE INDEX IF NOT EXISTS idx_book_borrowings_book_copy_pair ON public.book_borrowings(book_id, book_copy_id);
CREATE INDEX IF NOT EXISTS idx_book_borrowings_lent_by ON public.book_borrowings(lent_by);
CREATE INDEX IF NOT EXISTS idx_book_borrowings_returned_by ON public.book_borrowings(returned_by);
CREATE INDEX IF NOT EXISTS idx_books_added_by ON public.books(added_by);
CREATE INDEX IF NOT EXISTS idx_classes_created_by ON public.classes(created_by);
CREATE INDEX IF NOT EXISTS idx_grade_entries_recorded_by ON public.grade_entries(recorded_by);
CREATE INDEX IF NOT EXISTS idx_grant_transactions_recorded_by ON public.grant_transactions(recorded_by);
CREATE INDEX IF NOT EXISTS idx_message_read_receipts_user ON public.message_read_receipts(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_requests_resolved_by ON public.password_reset_requests(resolved_by);
CREATE INDEX IF NOT EXISTS idx_staff_branch_id ON public.staff(branch_id);
CREATE INDEX IF NOT EXISTS idx_student_fees_class_id ON public.student_fees(class_id);
CREATE INDEX IF NOT EXISTS idx_student_fees_recorded_by ON public.student_fees(recorded_by);
CREATE INDEX IF NOT EXISTS idx_students_branch_id ON public.students(branch_id);
CREATE INDEX IF NOT EXISTS idx_sbr_branch_id ON public.survey_branch_responses(branch_id);
CREATE INDEX IF NOT EXISTS idx_sbr_entered_by ON public.survey_branch_responses(entered_by);
CREATE INDEX IF NOT EXISTS idx_sbr_option_id ON public.survey_branch_responses(option_id);
CREATE INDEX IF NOT EXISTS idx_sbr_question_id ON public.survey_branch_responses(question_id);
CREATE INDEX IF NOT EXISTS idx_sbs_branch_id ON public.survey_branch_submissions(branch_id);
CREATE INDEX IF NOT EXISTS idx_sbs_submitted_by ON public.survey_branch_submissions(submitted_by);
CREATE INDEX IF NOT EXISTS idx_sir_answered_by ON public.survey_individual_responses(answered_by);
CREATE INDEX IF NOT EXISTS idx_sir_branch_id ON public.survey_individual_responses(branch_id);
CREATE INDEX IF NOT EXISTS idx_sir_option_id ON public.survey_individual_responses(option_id);
CREATE INDEX IF NOT EXISTS idx_sir_question_id ON public.survey_individual_responses(question_id);
CREATE INDEX IF NOT EXISTS idx_survey_questions_section_id ON public.survey_questions(section_id);
CREATE INDEX IF NOT EXISTS idx_survey_sections_survey_id ON public.survey_sections(survey_id);
CREATE INDEX IF NOT EXISTS idx_surveys_created_by ON public.surveys(created_by);
CREATE INDEX IF NOT EXISTS idx_user_documents_uploaded_by ON public.user_documents(uploaded_by);

-- Remove exact duplicates while retaining the consistently named index.
DROP INDEX IF EXISTS public.idx_activity_logs_created;
DROP INDEX IF EXISTS public.idx_activity_logs_user;
DROP INDEX IF EXISTS public.idx_book_borrowings_book;
DROP INDEX IF EXISTS public.idx_book_borrowings_borrower;
DROP INDEX IF EXISTS public.idx_class_enrollments_class;
DROP INDEX IF EXISTS public.idx_class_enrollments_student;
DROP INDEX IF EXISTS public.idx_classes_teacher;

DROP POLICY IF EXISTS "anon read enrollments" ON public.class_enrollments;

ALTER TABLE public.book_borrowings
  VALIDATE CONSTRAINT book_borrowings_book_copy_matches_book_fkey;

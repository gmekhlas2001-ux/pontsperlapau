-- Backend integrity hardening. This migration adds guards and atomic helpers;
-- it intentionally does not rewrite existing business records.

-- Custom Edge Functions are the only browser data boundary. Remove overlooked
-- table-level capabilities that are unnecessary for anon/authenticated roles.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT schemaname, tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format(
      'REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE %I.%I FROM anon, authenticated',
      r.schemaname, r.tablename
    );
  END LOOP;
END $$;

-- Broadcast reads belong to each user, not to one shared messages.read_at.
CREATE TABLE IF NOT EXISTS public.message_read_receipts (
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);
ALTER TABLE public.message_read_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.message_read_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_read_receipts TO service_role;

-- A borrowing must point to a copy of the same book, and a copy can only have
-- one open borrowing at a time.
CREATE UNIQUE INDEX IF NOT EXISTS book_copies_book_id_id_key
  ON public.book_copies(book_id, id);
ALTER TABLE public.book_borrowings
  DROP CONSTRAINT IF EXISTS book_borrowings_book_copy_matches_book_fkey;
ALTER TABLE public.book_borrowings
  ADD CONSTRAINT book_borrowings_book_copy_matches_book_fkey
  FOREIGN KEY (book_id, book_copy_id)
  REFERENCES public.book_copies(book_id, id)
  NOT VALID;
CREATE UNIQUE INDEX IF NOT EXISTS book_borrowings_one_open_per_copy
  ON public.book_borrowings(book_copy_id)
  WHERE returned_date IS NULL;

CREATE OR REPLACE FUNCTION public.validate_book_copy_available()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions, pg_temp
AS $$
DECLARE copy_row public.book_copies%ROWTYPE;
BEGIN
  SELECT * INTO copy_row FROM public.book_copies
  WHERE id = NEW.book_copy_id
  FOR UPDATE;
  IF NOT FOUND OR copy_row.book_id <> NEW.book_id THEN
    RAISE EXCEPTION 'Book copy does not belong to the selected book';
  END IF;
  IF copy_row.status <> 'available' THEN
    RAISE EXCEPTION 'Book copy is not available for borrowing (status: %)', copy_row.status;
  END IF;
  RETURN NEW;
END;
$$;

-- Keep copy rows synchronized when total_copies is edited. Reductions only
-- remove available copies and fail atomically if active/maintenance copies
-- would otherwise be destroyed.
CREATE OR REPLACE FUNCTION public.sync_book_copies_after_total_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions, pg_temp
AS $$
DECLARE physical_count integer;
DECLARE remove_count integer;
DECLARE removed_count integer;
BEGIN
  IF NEW.total_copies IS NOT DISTINCT FROM OLD.total_copies THEN RETURN NEW; END IF;
  SELECT count(*) INTO physical_count FROM public.book_copies WHERE book_id = NEW.id;
  IF NEW.total_copies > physical_count THEN
    INSERT INTO public.book_copies(book_id, copy_number, status, condition, location_shelf)
    SELECT NEW.id, n, 'available', NEW.physical_condition, NEW.location_shelf
    FROM generate_series(1, NEW.total_copies) n
    WHERE NOT EXISTS (
      SELECT 1 FROM public.book_copies c WHERE c.book_id = NEW.id AND c.copy_number = n
    );
  ELSIF NEW.total_copies < physical_count THEN
    remove_count := physical_count - NEW.total_copies;
    WITH removable AS (
      SELECT id FROM public.book_copies
      WHERE book_id = NEW.id AND status = 'available'
        AND NOT EXISTS (
          SELECT 1 FROM public.book_borrowings b
          WHERE b.book_copy_id = book_copies.id AND b.returned_date IS NULL
        )
      ORDER BY copy_number DESC LIMIT remove_count
    ), deleted AS (
      DELETE FROM public.book_copies WHERE id IN (SELECT id FROM removable) RETURNING id
    ) SELECT count(*) INTO removed_count FROM deleted;
    IF removed_count <> remove_count THEN
      RAISE EXCEPTION 'Cannot reduce total copies below copies currently borrowed or unavailable';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS sync_book_copies_on_total_change ON public.books;
CREATE TRIGGER sync_book_copies_on_total_change
BEFORE UPDATE OF total_copies ON public.books
FOR EACH ROW EXECUTE FUNCTION public.sync_book_copies_after_total_change();

-- Validate academic records at the database boundary as a race-safe backstop.
CREATE OR REPLACE FUNCTION public.validate_active_enrollment_record()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.class_enrollments e
    WHERE e.class_id = NEW.class_id AND e.student_id = NEW.student_id AND e.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Student is not actively enrolled in this class';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS validate_grade_active_enrollment ON public.grade_entries;
CREATE TRIGGER validate_grade_active_enrollment
BEFORE INSERT OR UPDATE OF class_id, student_id ON public.grade_entries
FOR EACH ROW EXECUTE FUNCTION public.validate_active_enrollment_record();
DROP TRIGGER IF EXISTS validate_attendance_active_enrollment ON public.attendance;
CREATE TRIGGER validate_attendance_active_enrollment
BEFORE INSERT OR UPDATE OF class_id, student_id ON public.attendance
FOR EACH ROW EXECUTE FUNCTION public.validate_active_enrollment_record();

CREATE OR REPLACE FUNCTION public.enroll_student_safely(
  p_class_id uuid, p_student_id uuid, p_enrollment_date date
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE class_capacity integer;
DECLARE active_count integer;
DECLARE enrollment_id uuid;
BEGIN
  SELECT max_capacity INTO class_capacity FROM public.classes
  WHERE id = p_class_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Class not found'; END IF;
  SELECT count(*) INTO active_count FROM public.class_enrollments
  WHERE class_id = p_class_id AND status = 'active';
  SELECT id INTO enrollment_id FROM public.class_enrollments
  WHERE class_id = p_class_id AND student_id = p_student_id;
  IF enrollment_id IS NULL AND active_count >= class_capacity THEN
    RAISE EXCEPTION 'Class is at maximum capacity';
  END IF;
  IF enrollment_id IS NULL THEN
    INSERT INTO public.class_enrollments(class_id, student_id, enrollment_date, status)
    VALUES (p_class_id, p_student_id, p_enrollment_date, 'active') RETURNING id INTO enrollment_id;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.class_enrollments WHERE id = enrollment_id AND status = 'active')
       AND active_count >= class_capacity THEN
      RAISE EXCEPTION 'Class is at maximum capacity';
    END IF;
    UPDATE public.class_enrollments SET status = 'active', enrollment_date = p_enrollment_date
    WHERE id = enrollment_id;
  END IF;
  RETURN enrollment_id;
END;
$$;
REVOKE ALL ON FUNCTION public.enroll_student_safely(uuid, uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enroll_student_safely(uuid, uuid, date) TO service_role;

-- Only pending financial transfers may transition to a terminal state.
CREATE OR REPLACE FUNCTION public.guard_transaction_state_transition()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, extensions, pg_temp AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status <> 'pending' OR NEW.status NOT IN ('completed', 'cancelled', 'failed') THEN
      RAISE EXCEPTION 'Invalid transaction status transition from % to %', OLD.status, NEW.status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_transaction_state_transition ON public.transactions;
CREATE TRIGGER guard_transaction_state_transition
BEFORE UPDATE OF status ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.guard_transaction_state_transition();

-- Password update and request closure succeed or fail together.
CREATE OR REPLACE FUNCTION public.resolve_password_reset_atomic(
  p_request_id uuid, p_user_id uuid, p_password_hash text,
  p_resolved_by uuid, p_note text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
BEGIN
  PERFORM 1 FROM public.password_reset_requests
  WHERE id = p_request_id AND user_id = p_user_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Password reset request is no longer pending'; END IF;
  UPDATE public.users SET password_hash = p_password_hash,
    session_invalid_before = now(), updated_at = now() WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'User not found'; END IF;
  UPDATE public.app_sessions SET revoked_at = COALESCE(revoked_at, now()) WHERE user_id = p_user_id;
  UPDATE public.password_reset_requests SET status = 'resolved', resolved_by = p_resolved_by,
    resolved_at = now(), resolved_note = p_note WHERE id = p_request_id AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Password reset request is no longer pending'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_password_reset_atomic(uuid, uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_password_reset_atomic(uuid, uuid, text, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.set_user_password_atomic(
  p_user_id uuid, p_password_hash text, p_changed_by uuid, p_note text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
BEGIN
  UPDATE public.users SET password_hash = p_password_hash,
    session_invalid_before = now(), updated_at = now() WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'User not found'; END IF;
  UPDATE public.app_sessions SET revoked_at = COALESCE(revoked_at, now()) WHERE user_id = p_user_id;
  UPDATE public.password_reset_requests SET status = 'resolved', resolved_by = p_changed_by,
    resolved_at = now(), resolved_note = p_note
  WHERE user_id = p_user_id AND status = 'pending';
END;
$$;
REVOKE ALL ON FUNCTION public.set_user_password_atomic(uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_password_atomic(uuid, text, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_login_attempt(
  p_email text, p_ip text, p_since timestamptz,
  p_email_limit integer, p_ip_limit integer
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
DECLARE attempt_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('login-email:' || p_email, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('login-ip:' || p_ip, 0));
  IF (SELECT count(*) FROM public.login_attempts WHERE email = p_email AND success = false AND created_at >= p_since) >= p_email_limit
    OR (SELECT count(*) FROM public.login_attempts WHERE ip = p_ip AND success = false AND created_at >= p_since) >= p_ip_limit
  THEN RETURN NULL; END IF;
  INSERT INTO public.login_attempts(email, ip, success)
  VALUES (p_email, p_ip, false) RETURNING id INTO attempt_id;
  RETURN attempt_id;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_login_attempt(text, text, timestamptz, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_login_attempt(text, text, timestamptz, integer, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.create_password_reset_if_allowed(
  p_email text, p_ip text, p_reason text, p_since timestamptz,
  p_email_limit integer, p_ip_limit integer
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
DECLARE target_user_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('reset-email:' || p_email, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('reset-ip:' || p_ip, 0));
  IF (SELECT count(*) FROM public.password_reset_requests WHERE email_tried = p_email AND created_at >= p_since) >= p_email_limit
    OR (SELECT count(*) FROM public.password_reset_requests WHERE ip = p_ip AND created_at >= p_since) >= p_ip_limit
  THEN RETURN false; END IF;
  SELECT id INTO target_user_id FROM public.users WHERE email = p_email AND status = 'active';
  INSERT INTO public.password_reset_requests(user_id, email_tried, reason, ip, status)
  VALUES (target_user_id, p_email, p_reason, p_ip, 'pending');
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.create_password_reset_if_allowed(text, text, text, timestamptz, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_password_reset_if_allowed(text, text, text, timestamptz, integer, integer) TO service_role;

-- Preserve student academic history by archiving accounts that already have
-- institutional records. Return value tells the caller whether blobs may be
-- safely removed after a true hard delete.
CREATE OR REPLACE FUNCTION public.delete_or_archive_user(target_user_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
DECLARE student_row_id uuid;
DECLARE has_history boolean;
BEGIN
  SELECT id INTO student_row_id FROM public.students WHERE user_id = target_user_id FOR UPDATE;
  IF student_row_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.class_enrollments WHERE student_id = student_row_id
      UNION ALL SELECT 1 FROM public.attendance WHERE student_id = student_row_id
      UNION ALL SELECT 1 FROM public.grade_entries WHERE student_id = student_row_id
      UNION ALL SELECT 1 FROM public.student_fees WHERE student_id = student_row_id
      UNION ALL SELECT 1 FROM public.parent_student_links WHERE student_id = student_row_id
    ) INTO has_history;
    IF has_history THEN
      UPDATE public.students SET deleted_at = COALESCE(deleted_at, now()), updated_at = now()
      WHERE id = student_row_id;
      UPDATE public.users SET status = 'inactive', session_invalid_before = now(), updated_at = now()
      WHERE id = target_user_id;
      UPDATE public.app_sessions SET revoked_at = COALESCE(revoked_at, now()) WHERE user_id = target_user_id;
      RETURN 'archived';
    END IF;
  END IF;
  PERFORM public.delete_user_cascade(target_user_id);
  RETURN 'deleted';
END;
$$;
REVOKE ALL ON FUNCTION public.delete_or_archive_user(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_or_archive_user(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.move_managed_user_branch_atomic(
  p_user_id uuid, p_branch_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
DECLARE staff_id uuid;
DECLARE student_id uuid;
BEGIN
  PERFORM 1 FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'User not found'; END IF;
  SELECT id INTO staff_id FROM public.staff WHERE user_id = p_user_id;
  SELECT id INTO student_id FROM public.students WHERE user_id = p_user_id;
  IF staff_id IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.classes WHERE teacher_id = staff_id AND deleted_at IS NULL)
    OR EXISTS (SELECT 1 FROM public.transactions WHERE sender_staff_id = staff_id OR receiver_staff_id = staff_id)
  ) THEN RAISE EXCEPTION 'Reassign this staff member responsibilities before changing branch'; END IF;
  IF student_id IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.class_enrollments WHERE student_id = student_id)
    OR EXISTS (SELECT 1 FROM public.attendance WHERE student_id = student_id)
    OR EXISTS (SELECT 1 FROM public.grade_entries WHERE student_id = student_id)
    OR EXISTS (SELECT 1 FROM public.student_fees WHERE student_id = student_id)
  ) THEN RAISE EXCEPTION 'Student history must remain in its original branch'; END IF;
  UPDATE public.users SET branch_id = p_branch_id, updated_at = now() WHERE id = p_user_id;
  UPDATE public.staff SET branch_id = p_branch_id, updated_at = now() WHERE user_id = p_user_id;
  UPDATE public.students SET branch_id = p_branch_id, updated_at = now() WHERE user_id = p_user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.move_managed_user_branch_atomic(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.move_managed_user_branch_atomic(uuid, uuid) TO service_role;

-- Survey child rows must belong to the same survey as their parent references.
CREATE OR REPLACE FUNCTION public.validate_survey_response_relationships()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, extensions, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.surveys s WHERE s.id = NEW.survey_id AND s.branch_id = NEW.branch_id) THEN
    RAISE EXCEPTION 'Survey and branch do not match';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.survey_questions q WHERE q.id = NEW.question_id AND q.survey_id = NEW.survey_id) THEN
    RAISE EXCEPTION 'Question does not belong to survey';
  END IF;
  IF NEW.option_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.survey_response_options o
    WHERE o.id = NEW.option_id AND o.survey_id = NEW.survey_id
      AND (o.question_id IS NULL OR o.question_id = NEW.question_id)
  ) THEN RAISE EXCEPTION 'Option does not belong to question'; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS validate_survey_aggregate_relationships ON public.survey_branch_responses;
CREATE TRIGGER validate_survey_aggregate_relationships
BEFORE INSERT OR UPDATE ON public.survey_branch_responses
FOR EACH ROW EXECUTE FUNCTION public.validate_survey_response_relationships();
DROP TRIGGER IF EXISTS validate_survey_individual_relationships ON public.survey_individual_responses;
CREATE TRIGGER validate_survey_individual_relationships
BEFORE INSERT OR UPDATE ON public.survey_individual_responses
FOR EACH ROW EXECUTE FUNCTION public.validate_survey_response_relationships();

CREATE OR REPLACE FUNCTION public.save_survey_aggregate_atomic(
  p_survey_id uuid, p_branch_id uuid, p_total_respondents integer,
  p_entered_by uuid, p_counts jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
DECLARE individual_total integer;
BEGIN
  PERFORM 1 FROM public.surveys WHERE id = p_survey_id AND branch_id = p_branch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Survey is outside this branch'; END IF;
  IF p_total_respondents < 0 OR jsonb_typeof(p_counts) <> 'array' THEN
    RAISE EXCEPTION 'Invalid survey payload';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_counts) AS x(question_id uuid, option_id uuid, count integer)
    LEFT JOIN public.survey_questions q ON q.id = x.question_id AND q.survey_id = p_survey_id
    LEFT JOIN public.survey_response_options o ON o.id = x.option_id AND o.survey_id = p_survey_id
      AND (o.question_id IS NULL OR o.question_id = x.question_id)
    WHERE x.count < 0 OR q.id IS NULL OR o.id IS NULL
  ) THEN RAISE EXCEPTION 'Survey counts contain invalid questions or options'; END IF;

  SELECT count(DISTINCT (respondent_type, respondent_id)) INTO individual_total
  FROM public.survey_individual_responses
  WHERE survey_id = p_survey_id AND branch_id = p_branch_id;

  INSERT INTO public.survey_branch_submissions(
    survey_id, branch_id, total_respondents, submitted_by
  ) VALUES (
    p_survey_id, p_branch_id, GREATEST(p_total_respondents, individual_total), p_entered_by
  ) ON CONFLICT (survey_id, branch_id) DO UPDATE SET
    total_respondents = EXCLUDED.total_respondents,
    submitted_by = EXCLUDED.submitted_by,
    updated_at = now();

  INSERT INTO public.survey_branch_responses(
    survey_id, branch_id, question_id, option_id, count, entered_by
  )
  SELECT p_survey_id, p_branch_id, x.question_id, x.option_id, x.count, p_entered_by
  FROM jsonb_to_recordset(p_counts) AS x(question_id uuid, option_id uuid, count integer)
  ON CONFLICT (survey_id, branch_id, question_id, option_id) DO UPDATE SET
    count = EXCLUDED.count, entered_by = EXCLUDED.entered_by, updated_at = now();
END;
$$;
REVOKE ALL ON FUNCTION public.save_survey_aggregate_atomic(uuid, uuid, integer, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_survey_aggregate_atomic(uuid, uuid, integer, uuid, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.save_survey_individual_atomic(
  p_survey_id uuid, p_branch_id uuid, p_respondent_type text,
  p_respondent_id uuid, p_respondent_name text, p_answered_by uuid,
  p_question_ids uuid[], p_answers jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
DECLARE individual_total integer;
BEGIN
  PERFORM 1 FROM public.surveys WHERE id = p_survey_id AND branch_id = p_branch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Survey is outside this branch'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.survey_respondents
    WHERE survey_id = p_survey_id AND branch_id = p_branch_id
      AND respondent_type = p_respondent_type AND respondent_id = p_respondent_id
  ) THEN RAISE EXCEPTION 'Respondent is not assigned to this survey'; END IF;
  IF jsonb_typeof(p_answers) <> 'array' THEN RAISE EXCEPTION 'Invalid answers payload'; END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_answers) AS x(question_id uuid, option_id uuid, text_answer text)
    LEFT JOIN public.survey_questions q ON q.id = x.question_id AND q.survey_id = p_survey_id
    LEFT JOIN public.survey_response_options o ON o.id = x.option_id AND o.survey_id = p_survey_id
      AND (o.question_id IS NULL OR o.question_id = x.question_id)
    WHERE q.id IS NULL OR (x.option_id IS NOT NULL AND o.id IS NULL)
  ) THEN RAISE EXCEPTION 'Answers contain invalid questions or options'; END IF;

  DELETE FROM public.survey_individual_responses
  WHERE survey_id = p_survey_id AND branch_id = p_branch_id
    AND respondent_type = p_respondent_type AND respondent_id = p_respondent_id
    AND question_id = ANY(COALESCE(p_question_ids, ARRAY[]::uuid[]));

  INSERT INTO public.survey_individual_responses(
    survey_id, branch_id, respondent_type, respondent_id, respondent_name,
    question_id, option_id, text_answer, answered_by, updated_at
  )
  SELECT p_survey_id, p_branch_id, p_respondent_type, p_respondent_id,
    p_respondent_name, x.question_id, x.option_id, NULLIF(btrim(x.text_answer), ''),
    p_answered_by, now()
  FROM jsonb_to_recordset(p_answers) AS x(question_id uuid, option_id uuid, text_answer text);

  SELECT count(DISTINCT (respondent_type, respondent_id)) INTO individual_total
  FROM public.survey_individual_responses
  WHERE survey_id = p_survey_id AND branch_id = p_branch_id;
  INSERT INTO public.survey_branch_submissions(
    survey_id, branch_id, total_respondents, submitted_by
  ) VALUES (p_survey_id, p_branch_id, individual_total, p_answered_by)
  ON CONFLICT (survey_id, branch_id) DO UPDATE SET
    total_respondents = GREATEST(public.survey_branch_submissions.total_respondents, EXCLUDED.total_respondents),
    submitted_by = EXCLUDED.submitted_by, updated_at = now();
END;
$$;
REVOKE ALL ON FUNCTION public.save_survey_individual_atomic(uuid, uuid, text, uuid, text, uuid, uuid[], jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_survey_individual_atomic(uuid, uuid, text, uuid, text, uuid, uuid[], jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.replace_survey_structure_atomic(
  p_survey_id uuid, p_fields jsonb, p_sections jsonb, p_questions jsonb, p_options jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
BEGIN
  PERFORM 1 FROM public.surveys WHERE id = p_survey_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Survey not found'; END IF;
  IF EXISTS (SELECT 1 FROM public.survey_branch_responses WHERE survey_id = p_survey_id)
    OR EXISTS (SELECT 1 FROM public.survey_individual_responses WHERE survey_id = p_survey_id)
    OR EXISTS (SELECT 1 FROM public.survey_branch_submissions WHERE survey_id = p_survey_id)
  THEN RAISE EXCEPTION 'Survey questions cannot change after responses are recorded'; END IF;
  IF jsonb_typeof(p_sections) <> 'array' OR jsonb_typeof(p_questions) <> 'array'
    OR jsonb_typeof(p_options) <> 'array' OR jsonb_array_length(p_questions) = 0
  THEN RAISE EXCEPTION 'Invalid survey structure'; END IF;

  DELETE FROM public.survey_response_options WHERE survey_id = p_survey_id;
  DELETE FROM public.survey_questions WHERE survey_id = p_survey_id;
  DELETE FROM public.survey_sections WHERE survey_id = p_survey_id;

  INSERT INTO public.survey_sections(id, survey_id, title, description, order_index)
  SELECT x.id, p_survey_id, x.title, x.description, x.order_index
  FROM jsonb_to_recordset(p_sections) AS x(id uuid, title text, description text, order_index integer);
  INSERT INTO public.survey_questions(
    id, survey_id, section_id, question_text, question_type, sentiment_enabled, order_index
  )
  SELECT x.id, p_survey_id, x.section_id, x.question_text, x.question_type,
    x.sentiment_enabled, x.order_index
  FROM jsonb_to_recordset(p_questions) AS x(
    id uuid, section_id uuid, question_text text, question_type text,
    sentiment_enabled boolean, order_index integer
  );
  INSERT INTO public.survey_response_options(
    survey_id, question_id, label, sentiment, order_index
  )
  SELECT p_survey_id, x.question_id, x.label, x.sentiment, x.order_index
  FROM jsonb_to_recordset(p_options) AS x(
    question_id uuid, label text, sentiment text, order_index integer
  );

  UPDATE public.surveys SET
    title = CASE WHEN p_fields ? 'title' THEN p_fields->>'title' ELSE title END,
    description = CASE WHEN p_fields ? 'description' THEN NULLIF(p_fields->>'description', '') ELSE description END,
    period = CASE WHEN p_fields ? 'period' THEN NULLIF(p_fields->>'period', '') ELSE period END,
    survey_date = CASE WHEN p_fields ? 'survey_date' THEN NULLIF(p_fields->>'survey_date', '')::date ELSE survey_date END,
    status = CASE WHEN p_fields ? 'status' THEN p_fields->>'status' ELSE status END,
    language = CASE WHEN p_fields ? 'language' THEN p_fields->>'language' ELSE language END,
    updated_at = now()
  WHERE id = p_survey_id;
END;
$$;
REVOKE ALL ON FUNCTION public.replace_survey_structure_atomic(uuid, jsonb, jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_survey_structure_atomic(uuid, jsonb, jsonb, jsonb, jsonb) TO service_role;

-- Normalize future branch labels without touching existing rows.
CREATE OR REPLACE FUNCTION public.trim_branch_labels()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, extensions, pg_temp AS $$
BEGIN
  NEW.name := btrim(NEW.name); NEW.province := btrim(NEW.province);
  NEW.city := NULLIF(btrim(NEW.city), '');
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trim_branch_labels ON public.branches;
CREATE TRIGGER trim_branch_labels BEFORE INSERT OR UPDATE OF name, province, city ON public.branches
FOR EACH ROW EXECUTE FUNCTION public.trim_branch_labels();

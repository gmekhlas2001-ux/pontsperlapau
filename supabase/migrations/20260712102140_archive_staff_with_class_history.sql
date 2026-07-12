-- Staff referenced by soft-deleted classes must be archived rather than hard
-- deleted so historical class ownership remains intact.
CREATE OR REPLACE FUNCTION public.delete_or_archive_user(target_user_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
DECLARE student_row_id uuid;
DECLARE staff_row_id uuid;
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

  SELECT id INTO staff_row_id FROM public.staff WHERE user_id = target_user_id FOR UPDATE;
  IF staff_row_id IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM public.classes WHERE teacher_id = staff_row_id) INTO has_history;
    IF has_history THEN
      UPDATE public.staff SET deleted_at = COALESCE(deleted_at, now()), updated_at = now()
      WHERE id = staff_row_id;
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

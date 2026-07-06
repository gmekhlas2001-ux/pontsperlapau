/*
  Close legacy public write and privileged-function paths left over from the
  original custom-auth implementation. Browser mutations now go through
  signed Edge Functions, so anon/authenticated callers only need read access.
*/

-- Privileged helpers are internal to Edge Functions or database machinery.
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_user_context(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_last_login(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.verify_password(text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.update_last_login(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_password(text, text) TO service_role;

-- Trigger helpers should resolve objects only from trusted schemas.
ALTER FUNCTION public.generate_transaction_reference() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.update_transaction_timestamps() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.set_user_context(text, text) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.sync_user_branch_from_staff() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.sync_user_branch_from_student() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.update_surveys_updated_at() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.validate_book_copy_available() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.set_notification_read_at() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.generate_student_id() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.set_student_id() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.update_enrollment_attendance() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.update_overdue_status() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.create_book_copies() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.update_book_availability_on_borrow() SET search_path = public, extensions, pg_temp;

-- Library and notification writes are service-role-only.
DO $$
DECLARE
  table_name text;
  policy record;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['book_copies', 'book_borrowings', 'notifications']
  LOOP
    FOR policy IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = table_name
        AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy.policyname, table_name);
    END LOOP;

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO anon, authenticated WITH CHECK (false)',
      table_name || '_edge_only_insert', table_name
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false)',
      table_name || '_edge_only_update', table_name
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO anon, authenticated USING (false)',
      table_name || '_edge_only_delete', table_name
    );
  END LOOP;
END $$;

-- Public object URLs do not require a broad bucket-listing policy.
DROP POLICY IF EXISTS public_images_select ON storage.objects;

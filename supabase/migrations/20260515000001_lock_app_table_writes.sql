/*
  # Lock browser table writes behind app-actions

  The SPA now sends table mutations through supabase/functions/app-actions,
  which verifies the signed app session, reloads the active caller, and applies
  role/branch rules before writing with the service role.

  This migration keeps existing SELECT policies intact but removes direct
  INSERT/UPDATE/DELETE/ALL policies for the covered tables, then adds explicit
  deny policies for anon/authenticated callers.
*/

DO $$
DECLARE
  t text;
  p record;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'activity_logs',
    'attendance',
    'books',
    'branches',
    'class_enrollments',
    'classes',
    'donors',
    'grant_transactions',
    'grants',
    'grade_entries',
    'messages',
    'organization_settings',
    'student_fees',
    'survey_branch_responses',
    'survey_branch_submissions',
    'survey_questions',
    'survey_response_options',
    'survey_sections',
    'surveys',
    'transactions'
  ]
  LOOP
    FOR p IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = t
        AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t);
    END LOOP;

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_edge_only_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_edge_only_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_edge_only_delete', t);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO anon, authenticated WITH CHECK (false)',
      t || '_edge_only_insert',
      t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false)',
      t || '_edge_only_update',
      t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO anon, authenticated USING (false)',
      t || '_edge_only_delete',
      t
    );
  END LOOP;
END $$;

DROP POLICY IF EXISTS public_images_insert ON storage.objects;
DROP POLICY IF EXISTS public_images_update ON storage.objects;
DROP POLICY IF EXISTS public_images_delete ON storage.objects;
DROP POLICY IF EXISTS public_images_edge_only_insert ON storage.objects;
DROP POLICY IF EXISTS public_images_edge_only_update ON storage.objects;
DROP POLICY IF EXISTS public_images_edge_only_delete ON storage.objects;

CREATE POLICY public_images_edge_only_insert
  ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'public-images' AND false);

CREATE POLICY public_images_edge_only_update
  ON storage.objects FOR UPDATE TO anon, authenticated
  USING (bucket_id = 'public-images' AND false)
  WITH CHECK (bucket_id = 'public-images' AND false);

CREATE POLICY public_images_edge_only_delete
  ON storage.objects FOR DELETE TO anon, authenticated
  USING (bucket_id = 'public-images' AND false);

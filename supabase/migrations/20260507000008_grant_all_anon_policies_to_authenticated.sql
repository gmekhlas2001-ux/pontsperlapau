/*
  # Grant existing anon-only policies to authenticated role too

  The SPA uses a custom HMAC auth flow; every request should reach Postgres
  as the `anon` role. In practice, stale Supabase Auth sessions in localStorage
  (left over from older builds where persistSession was enabled) can make some
  requests arrive as `authenticated` instead. With no policy granted to
  `authenticated`, those requests fail with either 401 Unauthorized or
  "row-level security policy violation".

  This migration mirrors every PUBLIC.* policy that targets `anon` so it also
  targets `authenticated`. Belt-and-suspenders defense — it's safe because the
  app's actual access control is enforced server-side in edge functions, not
  via RLS roles.
*/

DO $$
DECLARE
  pol RECORD;
  current_roles text[];
  cmd_text text;
  qual_text text;
  check_text text;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname, cmd, roles, qual, with_check, permissive
    FROM pg_policies
    WHERE schemaname = 'public'
      AND 'anon' = ANY(roles)
      AND NOT 'authenticated' = ANY(roles)
  LOOP
    -- Recreate the policy with both roles
    EXECUTE format('DROP POLICY %I ON %I.%I',
      pol.policyname, pol.schemaname, pol.tablename);

    cmd_text := pol.cmd;
    qual_text := COALESCE(pol.qual, 'true');
    check_text := COALESCE(pol.with_check, 'true');

    IF cmd_text = 'SELECT' THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I.%I FOR SELECT TO anon, authenticated USING (%s)',
        pol.policyname, pol.schemaname, pol.tablename, qual_text
      );
    ELSIF cmd_text = 'INSERT' THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I.%I FOR INSERT TO anon, authenticated WITH CHECK (%s)',
        pol.policyname, pol.schemaname, pol.tablename, check_text
      );
    ELSIF cmd_text = 'UPDATE' THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I.%I FOR UPDATE TO anon, authenticated USING (%s) WITH CHECK (%s)',
        pol.policyname, pol.schemaname, pol.tablename, qual_text, check_text
      );
    ELSIF cmd_text = 'DELETE' THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I.%I FOR DELETE TO anon, authenticated USING (%s)',
        pol.policyname, pol.schemaname, pol.tablename, qual_text
      );
    ELSIF cmd_text = 'ALL' THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I.%I FOR ALL TO anon, authenticated USING (%s) WITH CHECK (%s)',
        pol.policyname, pol.schemaname, pol.tablename, qual_text, check_text
      );
    END IF;
  END LOOP;
END $$;

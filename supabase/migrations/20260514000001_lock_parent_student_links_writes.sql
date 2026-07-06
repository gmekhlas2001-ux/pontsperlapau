/*
  # Lock parent_student_links behind the parent-links edge function

  The SPA uses a custom HMAC session token, so PostgREST cannot infer the
  current app user from auth.uid(). This table used to be fully writable by
  anon to make the UI work, but that allowed any browser with the anon key to
  create or delete parent-child links.

  Reads and writes now go through supabase/functions/parent-links, which uses
  the service role after verifying the app session token and branch scope.
*/

DROP POLICY IF EXISTS "anon can read parent_student_links" ON parent_student_links;
DROP POLICY IF EXISTS "anon can insert parent_student_links" ON parent_student_links;
DROP POLICY IF EXISTS "anon can update parent_student_links" ON parent_student_links;
DROP POLICY IF EXISTS "anon can delete parent_student_links" ON parent_student_links;

DROP POLICY IF EXISTS parent_student_links_no_anon_select ON parent_student_links;
DROP POLICY IF EXISTS parent_student_links_no_anon_insert ON parent_student_links;
DROP POLICY IF EXISTS parent_student_links_no_anon_update ON parent_student_links;
DROP POLICY IF EXISTS parent_student_links_no_anon_delete ON parent_student_links;

CREATE POLICY parent_student_links_no_anon_select
  ON parent_student_links FOR SELECT TO anon, authenticated USING (false);

CREATE POLICY parent_student_links_no_anon_insert
  ON parent_student_links FOR INSERT TO anon, authenticated WITH CHECK (false);

CREATE POLICY parent_student_links_no_anon_update
  ON parent_student_links FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY parent_student_links_no_anon_delete
  ON parent_student_links FOR DELETE TO anon, authenticated USING (false);

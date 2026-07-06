/*
  Allow the anon role to read, insert, and delete class_enrollments.
  The app uses custom auth (no Supabase Auth), so all frontend queries run as anon.
*/

DROP POLICY IF EXISTS "anon read class_enrollments" ON class_enrollments;
DROP POLICY IF EXISTS "anon insert class_enrollments" ON class_enrollments;
DROP POLICY IF EXISTS "anon delete class_enrollments" ON class_enrollments;

CREATE POLICY "anon read class_enrollments"
  ON class_enrollments FOR SELECT TO anon USING (true);

CREATE POLICY "anon insert class_enrollments"
  ON class_enrollments FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon delete class_enrollments"
  ON class_enrollments FOR DELETE TO anon USING (true);

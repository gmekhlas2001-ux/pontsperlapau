/*
  # Parent Portal

  Adds a `parent` value to the user_role enum and creates the
  parent_student_links table that ties a parent account to one or more
  student records. Parents get read-only access to their children's data.

  Tables
  ------
  parent_student_links
    parent_user_id  FK → users (the parent's user row)
    student_id      FK → students
    relationship    e.g. "mother", "father", "guardian"
    is_primary      whether this is the primary guardian
*/

-- Extend the role enum (safe — only adds, never removes)
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'parent';

CREATE TABLE IF NOT EXISTS parent_student_links (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_user_id   uuid NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  student_id       uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  relationship     varchar(50) NOT NULL DEFAULT 'guardian',
  is_primary       boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (parent_user_id, student_id)
);

CREATE INDEX idx_psl_parent  ON parent_student_links(parent_user_id);
CREATE INDEX idx_psl_student ON parent_student_links(student_id);

ALTER TABLE parent_student_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon can read parent_student_links"
  ON parent_student_links FOR SELECT TO anon USING (true);
CREATE POLICY "anon can insert parent_student_links"
  ON parent_student_links FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon can update parent_student_links"
  ON parent_student_links FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon can delete parent_student_links"
  ON parent_student_links FOR DELETE TO anon USING (true);

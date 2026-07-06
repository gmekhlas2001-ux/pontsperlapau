/*
  # Grade Entries Table

  Stores individual assessment scores per student per class.
  Multiple entries are allowed per student (midterm, final, assignments, quizzes…).

  The existing `class_enrollments.grade` column keeps the final/overall letter grade
  set by the teacher — this table holds the granular records that inform it.

  ## Columns
  - `id`               — primary key
  - `class_id`         — FK → classes
  - `student_id`       — FK → students
  - `assessment_name`  — e.g. "Midterm", "Final Exam", "Assignment 1"
  - `assessment_type`  — midterm | final | assignment | quiz | project | other
  - `score`            — numeric score (nullable — teacher may enter letter only)
  - `max_score`        — max possible points (default 100)
  - `grade_letter`     — A / B+ / C / etc. (nullable)
  - `notes`            — optional teacher comment
  - `assessment_date`  — date of assessment
  - `recorded_by`      — FK → users (teacher who entered it)
*/

CREATE TYPE assessment_type AS ENUM (
  'midterm', 'final', 'assignment', 'quiz', 'project', 'other'
);

CREATE TABLE IF NOT EXISTS grade_entries (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id         uuid NOT NULL REFERENCES classes(id)  ON DELETE CASCADE,
  student_id       uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  assessment_name  varchar(100) NOT NULL,
  assessment_type  assessment_type NOT NULL DEFAULT 'assignment',
  score            decimal(6,2),
  max_score        decimal(6,2) NOT NULL DEFAULT 100,
  grade_letter     varchar(5),
  notes            text,
  assessment_date  date NOT NULL DEFAULT CURRENT_DATE,
  recorded_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at       timestamptz DEFAULT now() NOT NULL,
  updated_at       timestamptz DEFAULT now() NOT NULL,

  CONSTRAINT valid_score      CHECK (score IS NULL OR (score >= 0 AND score <= max_score)),
  CONSTRAINT valid_max_score  CHECK (max_score > 0)
);

CREATE INDEX idx_grade_entries_class_id    ON grade_entries(class_id);
CREATE INDEX idx_grade_entries_student_id  ON grade_entries(student_id);
CREATE INDEX idx_grade_entries_class_student ON grade_entries(class_id, student_id);

-- updated_at trigger
CREATE TRIGGER update_grade_entries_updated_at
  BEFORE UPDATE ON grade_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE grade_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon can read grade_entries"
  ON grade_entries FOR SELECT TO anon USING (true);

CREATE POLICY "anon can insert grade_entries"
  ON grade_entries FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon can update grade_entries"
  ON grade_entries FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon can delete grade_entries"
  ON grade_entries FOR DELETE TO anon USING (true);

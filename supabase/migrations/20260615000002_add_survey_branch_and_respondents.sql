ALTER TABLE surveys
ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS respondent_type text DEFAULT 'students' NOT NULL
  CHECK (respondent_type IN ('students', 'staff', 'students_staff'));

CREATE INDEX IF NOT EXISTS idx_surveys_branch_id ON surveys(branch_id);

CREATE TABLE IF NOT EXISTS survey_respondents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id uuid NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  respondent_type text NOT NULL CHECK (respondent_type IN ('student', 'staff')),
  respondent_id uuid NOT NULL,
  respondent_name text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(survey_id, respondent_type, respondent_id)
);

CREATE INDEX IF NOT EXISTS idx_survey_respondents_survey ON survey_respondents(survey_id);
CREATE INDEX IF NOT EXISTS idx_survey_respondents_branch ON survey_respondents(branch_id);
CREATE INDEX IF NOT EXISTS idx_survey_respondents_type ON survey_respondents(survey_id, respondent_type);

ALTER TABLE survey_respondents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read_survey_respondents"
  ON survey_respondents FOR SELECT TO anon USING (true);
